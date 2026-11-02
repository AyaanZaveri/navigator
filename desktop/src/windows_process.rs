//! Assign the backend to its kill-on-close job atomically at process creation.
//! Even a crash during startup cannot leave an unowned suspended process.
use std::ffi::OsStr;
use std::os::windows::{
    ffi::OsStrExt,
    io::{AsRawHandle, FromRawHandle, OwnedHandle},
};
use std::path::Path;
use windows_sys::Win32::{
    Foundation::*,
    System::{JobObjects::*, Threading::*},
};

pub struct Process {
    process: OwnedHandle,
    _job: OwnedHandle,
}

struct Attributes(LPPROC_THREAD_ATTRIBUTE_LIST);
impl Drop for Attributes {
    fn drop(&mut self) {
        unsafe {
            DeleteProcThreadAttributeList(self.0);
        }
    }
}

fn wide(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(Some(0)).collect()
}
fn error(context: &str) -> String {
    format!("{context}: {}", std::io::Error::last_os_error())
}

impl Process {
    pub fn spawn(node: &Path, directory: &Path, port: u16) -> Result<Self, String> {
        let overrides = [
            ("NODE_ENV", "production".to_string()),
            ("HOSTNAME", "127.0.0.1".into()),
            ("PORT", port.to_string()),
            ("NAVIGATOR_DESKTOP", "1".into()),
        ];
        let mut vars: Vec<_> = std::env::vars_os()
            .filter(|(key, _)| {
                !overrides
                    .iter()
                    .any(|(name, _)| key.to_string_lossy().eq_ignore_ascii_case(name))
            })
            .collect();
        vars.extend(
            overrides
                .into_iter()
                .map(|(key, value)| (key.into(), value.into())),
        );
        vars.sort_by_key(|(key, _)| key.to_string_lossy().to_uppercase());
        let mut env = Vec::<u16>::new();
        for (key, value) in vars {
            env.extend(key.encode_wide());
            env.push(b'=' as u16);
            env.extend(value.encode_wide());
            env.push(0);
        }
        env.push(0);
        let executable = wide(node.as_os_str());
        let cwd = wide(directory.as_os_str());
        let mut command = wide(OsStr::new(&format!("\"{}\" server.js", node.display())));
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err(error("Could not create backend job"));
            }
            let job = OwnedHandle::from_raw_handle(handle);
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of_val(&limits) as u32,
            ) == 0
            {
                return Err(error("Could not configure backend job"));
            }
            let mut bytes = 0;
            InitializeProcThreadAttributeList(std::ptr::null_mut(), 1, 0, &mut bytes);
            if bytes == 0 {
                return Err(error("Could not size backend process attributes"));
            }
            // usize storage provides pointer alignment and remains alive until
            // after the attribute list is deleted.
            let mut storage = vec![0usize; bytes.div_ceil(std::mem::size_of::<usize>())];
            let list = storage.as_mut_ptr().cast();
            if InitializeProcThreadAttributeList(list, 1, 0, &mut bytes) == 0 {
                return Err(error("Could not initialize backend process attributes"));
            }
            let attributes = Attributes(list);
            let jobs = [handle];
            if UpdateProcThreadAttribute(
                attributes.0,
                0,
                PROC_THREAD_ATTRIBUTE_JOB_LIST as usize,
                jobs.as_ptr().cast(),
                std::mem::size_of_val(&jobs),
                std::ptr::null_mut(),
                std::ptr::null(),
            ) == 0
            {
                return Err(error("Could not set backend process job"));
            }
            let mut startup: STARTUPINFOEXW = std::mem::zeroed();
            startup.StartupInfo.cb = std::mem::size_of_val(&startup) as u32;
            startup.lpAttributeList = attributes.0;
            let mut info: PROCESS_INFORMATION = std::mem::zeroed();
            if CreateProcessW(
                executable.as_ptr(),
                command.as_mut_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                0,
                CREATE_NO_WINDOW
                    | CREATE_SUSPENDED
                    | CREATE_UNICODE_ENVIRONMENT
                    | EXTENDED_STARTUPINFO_PRESENT,
                env.as_ptr().cast(),
                cwd.as_ptr(),
                &startup.StartupInfo,
                &mut info,
            ) == 0
            {
                return Err(error("Could not start Next"));
            }
            let process = OwnedHandle::from_raw_handle(info.hProcess);
            let thread = OwnedHandle::from_raw_handle(info.hThread);
            if ResumeThread(thread.as_raw_handle()) == u32::MAX {
                let message = error("Could not attach/start backend in its job");
                TerminateProcess(info.hProcess, 1);
                WaitForSingleObject(info.hProcess, 5000);
                return Err(message);
            }
            Ok(Self { process, _job: job })
        }
    }
    pub fn try_wait(&mut self) -> Result<Option<String>, String> {
        unsafe {
            match WaitForSingleObject(self.process.as_raw_handle(), 0) {
                WAIT_TIMEOUT => Ok(None),
                WAIT_OBJECT_0 => {
                    let mut code = 0;
                    if GetExitCodeProcess(self.process.as_raw_handle(), &mut code) == 0 {
                        return Err(error("Could not read backend status"));
                    }
                    Ok(Some(format!("exit code {code}")))
                }
                _ => Err(error("Could not wait for backend")),
            }
        }
    }
    pub fn stop(&mut self) {
        unsafe {
            TerminateJobObject(self._job.as_raw_handle(), 1);
            WaitForSingleObject(self.process.as_raw_handle(), 5000);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "set NAVIGATOR_TEST_NODE to node.exe"]
    fn job_closes_backend_and_descendants() {
        let node = std::env::var_os("NAVIGATOR_TEST_NODE").expect("Set NAVIGATOR_TEST_NODE");
        let directory = std::env::temp_dir().join(format!("navigator-job-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        std::fs::write(directory.join("server.js"), r#"
            const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
            require('node:fs').writeFileSync('child.pid', String(child.pid));
            setInterval(()=>{},1000);
        "#).unwrap();
        let process = Process::spawn(Path::new(&node), &directory, 37371).unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        let child_id = loop {
            if let Ok(id) = std::fs::read_to_string(directory.join("child.pid")) {
                break id.trim().parse::<u32>().unwrap();
            }
            assert!(
                std::time::Instant::now() < deadline,
                "Backend did not spawn its child"
            );
            std::thread::sleep(std::time::Duration::from_millis(25));
        };
        unsafe {
            let child = OpenProcess(PROCESS_SYNCHRONIZE, 0, child_id);
            assert!(!child.is_null());
            let child = OwnedHandle::from_raw_handle(child);
            // Hold a separate root handle while closing the job owner.
            let root_id = GetProcessId(process.process.as_raw_handle());
            let root = OpenProcess(PROCESS_SYNCHRONIZE, 0, root_id);
            assert!(!root.is_null());
            let root = OwnedHandle::from_raw_handle(root);
            drop(process);
            assert_eq!(
                WaitForSingleObject(root.as_raw_handle(), 5000),
                WAIT_OBJECT_0
            );
            assert_eq!(
                WaitForSingleObject(child.as_raw_handle(), 5000),
                WAIT_OBJECT_0
            );
        }
        std::fs::remove_dir_all(directory).unwrap();
    }
}
