# Windows installation readiness: 0.4.1

The 0.4.0 preparation helper requested `/login` and required status 200. The
current login route intentionally returns 307 to `/?signIn=1`; the raw Node HTTP
client does not follow redirects. The installed server was starting correctly,
but every readiness probe failed until its 30-second deadline.

Reproduced on the Zenbook in the installed directory: direct browser-style
requests following the redirect returned 200; the actual preparation helper
repeatedly received 307. The corrected helper probes `/`, the public guest entry,
and still requires a successful response body. Its timeout includes the last
observed HTTP status for diagnosis.

`scripts/test-windows-install-readiness.cjs` launches a real owned fixture server
whose legacy login redirects. It failed before the fix and passes afterwards;
it also rejects unhealthy entry responses and verifies child cleanup. The test
uses a short configurable deadline; production retains 30 seconds.

Release verification must use `Start-Process -Wait -PassThru` and inspect the
returned process's ExitCode for GUI-subsystem executables. A bare invocation and
`$LASTEXITCODE` did not reliably prove completion in the earlier SSH validation.
The installer itself already uses NSIS ExecWait; that correctly exposed the
readiness failure. Validate actual installer extraction and preparation at the
installed path before declaring an installer fixed.

Sources: [Node HTTP response API](https://nodejs.org/api/http.html#class-httpincomingmessage),
[PowerShell Start-Process](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/start-process),
and the application's `app/login/page.tsx` and `proxy.ts`.
