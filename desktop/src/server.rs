use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::Path;
use std::process::{Child, Command};
use std::time::{Duration, Instant};

/// A packaged Next standalone server. Drop always reaps the owned process.
pub struct Server(Child);
impl Server {
    pub fn start(resources: &Path, port: u16) -> Result<Self, String> {
        let address = SocketAddr::from(([127, 0, 0, 1], port));
        // Never attach a privileged bridge to an unrelated process on this port.
        let reservation = TcpListener::bind(address)
            .map_err(|e| format!("Desktop server port {port} is unavailable: {e}"))?;
        let node = resources
            .join("runtime")
            .join(if cfg!(windows) { "node.exe" } else { "node" });
        let directory = resources.join("server");
        if !node.is_file() || !directory.join("server.js").is_file() {
            return Err("Packaged Node runtime or Next standalone server is missing".into());
        }
        drop(reservation);
        let child = Command::new(node)
            .arg("server.js")
            .current_dir(directory)
            .env("NODE_ENV", "production")
            .env("HOSTNAME", "127.0.0.1")
            .env("PORT", port.to_string())
            .env("NAVIGATOR_DESKTOP", "1")
            .spawn()
            .map_err(|e| format!("Could not start Next: {e}"))?;
        let mut server = Self(child);
        let deadline = Instant::now() + Duration::from_secs(30);
        while Instant::now() < deadline {
            if let Some(status) = server.0.try_wait().map_err(|e| e.to_string())? {
                return Err(format!("Next exited during startup: {status}"));
            }
            if TcpStream::connect_timeout(&address, Duration::from_millis(100)).is_ok() {
                return Ok(server);
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        Err("Next did not start within 30 seconds".into())
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
