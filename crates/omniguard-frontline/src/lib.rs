use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;

pub const ENGINE: &str = "frontline-0.1.0";
pub fn checks() -> Value {
    serde_json::from_str(include_str!("../../../contracts/frontline-checks-v1.json")).unwrap()
}
fn exact(value: &Value, fields: &[&str]) -> Result<(), String> {
    let object = value.as_object().ok_or("Expected an object")?;
    if object.len() != fields.len() || fields.iter().any(|key| !object.contains_key(*key)) {
        return Err(
            "Missing or unexpected field; raw messages and attachments are not accepted".into(),
        );
    }
    Ok(())
}
fn label(value: &Value, name: bool) -> bool {
    value.as_str().is_some_and(|s| {
        !s.trim().is_empty()
            && s.len() <= if name { 80 } else { 64 }
            && s.bytes().all(|c| {
                c.is_ascii_alphanumeric() || b"_-".contains(&c) || (name && b" .".contains(&c))
            })
    })
}
fn epoch(value: &Value) -> Option<u64> {
    value.as_u64().filter(|n| *n <= 4_102_444_800)
}
pub fn canonical(value: &Value) -> String {
    match value {
        Value::Object(map) => {
            let keys: BTreeSet<_> = map.keys().collect();
            format!(
                "{{{}}}",
                keys.into_iter()
                    .map(|k| format!(
                        "{}:{}",
                        serde_json::to_string(k).unwrap(),
                        canonical(&map[k])
                    ))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
        Value::Array(items) => format!(
            "[{}]",
            items.iter().map(canonical).collect::<Vec<_>>().join(",")
        ),
        _ => value.to_string(),
    }
}
pub fn validate(input: &Value) -> Result<(), String> {
    if canonical(input).len() > 65_536 {
        return Err("Intake exceeds 64 KiB".into());
    }
    exact(
        input,
        &[
            "schema_version",
            "isolated_fixture",
            "engagement_id",
            "name",
            "sequence",
            "entries",
        ],
    )?;
    if input["schema_version"] != 1
        || input["isolated_fixture"] != true
        || !label(&input["engagement_id"], false)
        || !label(&input["name"], true)
        || !input["sequence"]
            .as_u64()
            .is_some_and(|n| (1..=1_000_000).contains(&n))
    {
        return Err("Invalid fixture identity or sequence".into());
    }
    let entries = input["entries"].as_array().ok_or("Expected entries")?;
    if entries.is_empty() || entries.len() > 20 {
        return Err("Expected 1 to 20 entry points".into());
    }
    let mut ids = BTreeSet::new();
    let mut evidence_ids = BTreeSet::new();
    for entry in entries {
        exact(entry, &["id", "name", "owner", "check_id", "evidence"])?;
        if !label(&entry["id"], false)
            || !label(&entry["name"], true)
            || !ids.insert(entry["id"].as_str().unwrap())
            || !(entry["owner"].is_null() || label(&entry["owner"], true))
            || !(entry["check_id"].is_null() || label(&entry["check_id"], false))
        {
            return Err("Invalid or duplicate entry point".into());
        }
        let ev = &entry["evidence"];
        if ev.is_null() {
            continue;
        }
        exact(ev, &["id", "source", "captured_at", "expires_at", "facts"])?;
        if !label(&ev["id"], false)
            || !evidence_ids.insert(ev["id"].as_str().unwrap())
            || ev["source"] != "synthetic_fixture"
        {
            return Err("Expected unique synthetic evidence".into());
        }
        let captured = epoch(&ev["captured_at"]).ok_or("Invalid capture time")?;
        let expiry = epoch(&ev["expires_at"]).ok_or("Invalid expiry time")?;
        if expiry <= captured || expiry - captured > 86_400 {
            return Err("Evidence lifetime must be at most 24 hours".into());
        }
        let facts = ev["facts"].as_object().ok_or("Expected boolean facts")?;
        if facts.len() > 12
            || facts
                .iter()
                .any(|(key, v)| !label(&json!(key), false) || !v.is_boolean())
        {
            return Err("Only bounded named boolean observations are accepted".into());
        }
        if let Some(check) = checks()
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"] == entry["check_id"])
            && facts
                .keys()
                .any(|key| !check["facts"].as_array().unwrap().contains(&json!(key)))
        {
            return Err("Unexpected fact for this check".into());
        }
    }
    Ok(())
}
pub fn assess(input: &Value, now: u64) -> Result<Value, String> {
    validate(input)?;
    if now > 4_102_444_800 {
        return Err("Invalid assessment time".into());
    }
    let registry = checks();
    let results: Vec<Value> = input["entries"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| {
            let ev = &entry["evidence"];
            let check = registry
                .as_array()
                .unwrap()
                .iter()
                .find(|c| c["id"] == entry["check_id"]);
            let mut reasons: Vec<String> = vec![];
            let mut coverage = "assessed";
            let mut outcome = "unknown";
            if entry["owner"].is_null() || entry["check_id"].is_null() {
                coverage = "incomplete";
                reasons.push("Owner and defined check are required".into());
            } else if check.is_none() {
                coverage = "unsupported";
                reasons.push("No implemented check for this entry point".into());
            } else if ev.is_null() {
                coverage = "unassessed";
                reasons.push("No evidence supplied".into());
            } else if ev["captured_at"].as_u64().unwrap() > now {
                coverage = "incomplete";
                reasons.push("Evidence capture time is in the future".into());
            } else if ev["expires_at"].as_u64().unwrap() <= now {
                coverage = "stale";
                reasons.push("Evidence has expired".into());
            } else {
                let keys = check.unwrap()["facts"].as_array().unwrap();
                if keys.iter().any(|k| {
                    !ev["facts"]
                        .as_object()
                        .unwrap()
                        .contains_key(k.as_str().unwrap())
                }) {
                    coverage = "incomplete";
                    reasons.push("Required observations are missing".into());
                } else {
                    for k in keys {
                        if ev["facts"][k.as_str().unwrap()] == false {
                            reasons.push(format!("Not satisfied: {}", k.as_str().unwrap()));
                        }
                    }
                    outcome = if reasons.is_empty() { "pass" } else { "fail" };
                }
            }
            json!({"entry_id":entry["id"],"coverage":coverage,"outcome":outcome,"reasons":reasons})
        })
        .collect();
    Ok(
        json!({"engine_version":ENGINE,"intake":input,"intake_sha256":format!("{:x}",Sha256::digest(canonical(input))),"assessed_at":now,"results":results}),
    )
}
