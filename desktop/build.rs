fn main() {
    println!("cargo:rerun-if-changed=../assets/icons/windows/Navigator.ico");
    println!("cargo:rerun-if-changed=windows/app.manifest");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        // Cross-target cargo check needs no Windows resource compiler. Release
        // artifacts are always built on Windows, where resources are mandatory.
        if std::env::var("HOST") != std::env::var("TARGET") {
            println!("cargo:warning=Cross-check only: Windows resources require a Windows host");
            return;
        }
        winresource::WindowsResource::new()
            .set_icon("../assets/icons/windows/Navigator.ico")
            .set_manifest_file("windows/app.manifest")
            .set("ProductName", "Navigator")
            .set("FileDescription", "Navigator Desktop")
            .compile()
            .expect("Could not embed Navigator's Windows icon and manifest");
    }
}
