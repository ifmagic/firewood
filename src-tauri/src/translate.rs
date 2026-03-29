use hmac::{Hmac, Mac};
use md5::{Digest as Md5Digest, Md5};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::Sha256;

// ============ Common types ============

#[derive(Serialize, Deserialize)]
pub struct TranslateResult {
    pub text: String,
    pub from: String,
    pub to: String,
}

// ============ Baidu Translate ============
// Uses the new AI translation API with Bearer token (API Key auth)

#[derive(Deserialize)]
#[allow(dead_code)]
struct BaiduTransResult {
    src: String,
    dst: String,
}

#[derive(Deserialize)]
struct BaiduResponse {
    trans_result: Option<Vec<BaiduTransResult>>,
    error_code: Option<String>,
    error_msg: Option<String>,
}

#[tauri::command]
pub async fn baidu_translate(
    text: String,
    from: String,
    to: String,
    appid: String,
    secret: String,
) -> Result<TranslateResult, String> {
    // Build sign: md5(appid + q + salt + secret)
    let salt: u32 = rand::thread_rng().gen();
    let sign_str = format!("{}{}{}{}", appid, text, salt, secret);
    let mut hasher = Md5::new();
    hasher.update(sign_str.as_bytes());
    let sign = format!("{:x}", hasher.finalize());

    let client = reqwest::Client::new();
    let resp = client
        .post("https://fanyi-api.baidu.com/api/trans/vip/translate")
        .form(&[
            ("q", text.as_str()),
            ("from", from.as_str()),
            ("to", to.as_str()),
            ("appid", appid.as_str()),
            ("salt", &salt.to_string()),
            ("sign", &sign),
        ])
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let body: BaiduResponse = resp.json().await.map_err(|e| format!("解析失败: {}", e))?;

    if let Some(code) = &body.error_code {
        if code != "52000" {
            return Err(format!(
                "百度翻译错误 {}: {}",
                code,
                body.error_msg.unwrap_or_default()
            ));
        }
    }

    let results = body.trans_result.ok_or("翻译结果为空")?;
    let translated = results
        .iter()
        .map(|r| r.dst.clone())
        .collect::<Vec<_>>()
        .join("\n");

    Ok(TranslateResult {
        text: translated,
        from: from.clone(),
        to: to.clone(),
    })
}

// ============ Tencent Cloud Translate ============
// Uses TC3-HMAC-SHA256 signature

type HmacSha256 = Hmac<Sha256>;

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC key length error");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn sha256_hex(data: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    hex::encode(hasher.finalize())
}

#[derive(Deserialize)]
struct TencentInnerResponse {
    #[serde(rename = "TargetText")]
    target_text: Option<String>,
    #[serde(rename = "Source")]
    source: Option<String>,
    #[serde(rename = "Target")]
    target: Option<String>,
    #[serde(rename = "Error")]
    error: Option<TencentError>,
}

#[derive(Deserialize)]
struct TencentError {
    #[serde(rename = "Code")]
    code: String,
    #[serde(rename = "Message")]
    message: String,
}

#[derive(Deserialize)]
struct TencentResponse {
    #[serde(rename = "Response")]
    response: TencentInnerResponse,
}

#[tauri::command]
pub async fn tencent_translate(
    text: String,
    from: String,
    to: String,
    secret_id: String,
    secret_key: String,
    region: String,
) -> Result<TranslateResult, String> {
    let service = "tmt";
    let host = "tmt.tencentcloudapi.com";
    let action = "TextTranslate";
    let version = "2018-03-21";

    let now = chrono::Utc::now();
    let timestamp = now.timestamp();
    let date = now.format("%Y-%m-%d").to_string();

    let payload = serde_json::json!({
        "SourceText": text,
        "Source": from,
        "Target": to,
        "ProjectId": 0
    })
    .to_string();

    // Step 1: Canonical request
    let content_type = "application/json; charset=utf-8";
    let canonical_headers = format!(
        "content-type:{}\nhost:{}\nx-tc-action:{}\n",
        content_type,
        host,
        action.to_lowercase()
    );
    let signed_headers = "content-type;host;x-tc-action";
    let hashed_payload = sha256_hex(&payload);
    let canonical_request = format!(
        "POST\n/\n\n{}\n{}\n{}",
        canonical_headers, signed_headers, hashed_payload
    );

    // Step 2: String to sign
    let algorithm = "TC3-HMAC-SHA256";
    let credential_scope = format!("{}/{}/tc3_request", date, service);
    let hashed_canonical = sha256_hex(&canonical_request);
    let string_to_sign = format!(
        "{}\n{}\n{}\n{}",
        algorithm, timestamp, credential_scope, hashed_canonical
    );

    // Step 3: Signature
    let secret_date = hmac_sha256(
        format!("TC3{}", secret_key).as_bytes(),
        date.as_bytes(),
    );
    let secret_service = hmac_sha256(&secret_date, service.as_bytes());
    let secret_signing = hmac_sha256(&secret_service, b"tc3_request");
    let signature = hex::encode(hmac_sha256(&secret_signing, string_to_sign.as_bytes()));

    // Step 4: Authorization
    let authorization = format!(
        "{} Credential={}/{}, SignedHeaders={}, Signature={}",
        algorithm, secret_id, credential_scope, signed_headers, signature
    );

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("https://{}", host))
        .header("Authorization", &authorization)
        .header("Content-Type", content_type)
        .header("Host", host)
        .header("X-TC-Action", action)
        .header("X-TC-Timestamp", timestamp.to_string())
        .header("X-TC-Version", version)
        .header("X-TC-Region", &region)
        .body(payload)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let body: TencentResponse = resp.json().await.map_err(|e| format!("解析失败: {}", e))?;

    if let Some(err) = body.response.error {
        return Err(format!("腾讯翻译错误 {}: {}", err.code, err.message));
    }

    Ok(TranslateResult {
        text: body.response.target_text.unwrap_or_default(),
        from: body.response.source.unwrap_or(from),
        to: body.response.target.unwrap_or(to),
    })
}
