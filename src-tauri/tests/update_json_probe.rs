//! M20 排查用例：用插件真实的 RemoteRelease 反序列化器验证线上 latest.json 形态
//! （用户实机报 `missing field 'url'`，本地复现定位）。
use tauri_plugin_updater::RemoteRelease;

fn parse(s: &str) -> Result<RemoteRelease, String> {
    serde_json::from_str::<RemoteRelease>(s).map_err(|e| e.to_string())
}

#[test]
fn live_latest_json_parses() {
    let json = r#"{
  "version": "0.2.0",
  "notes": "release notes",
  "pub_date": "2026-10-11T09:48:57.663Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "dW50cnVzdGVk...",
      "url": "https://github.com/zhibushiwo/video-cut/releases/download/v0.2.0/video-cut_0.2.0_x64-setup.exe"
    }
  }
}"#;
    let r = parse(json).expect("当前线上形态应可解析");
    assert!(r.download_url("windows-x86_64").is_ok());
}

#[test]
fn placeholder_json_parses() {
    let json = r#"{
  "version": "0.0.0",
  "notes": "占位",
  "pub_date": "2026-10-11T00:00:00Z",
  "platforms": {
    "windows-x86_64": { "signature": "placeholder", "url": "https://github.com/zhibushiwo/video-cut/releases" }
  }
}"#;
    assert!(parse(json).is_ok());
}
