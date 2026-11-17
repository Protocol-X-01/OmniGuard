use omniguard_frontline::{assess, validate};
use serde_json::{Value, json};
fn risk() -> Value {
    serde_json::from_str(include_str!(
        "../../../fixtures/frontline/team-risk.intake.json"
    ))
    .unwrap()
}
#[test]
fn interaction_failures_and_gaps_are_distinct() {
    let r = assess(&risk(), 1794673260).unwrap();
    assert_eq!(
        r["results"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|x| x["outcome"] == "fail")
            .count(),
        5
    );
    assert_eq!(r["results"][5]["coverage"], "unsupported");
    assert_eq!(r["results"][6]["coverage"], "unassessed");
}
#[test]
fn fixes_do_not_erase_uncovered_entry_points() {
    let input = serde_json::from_str(include_str!(
        "../../../fixtures/frontline/team-retest.intake.json"
    ))
    .unwrap();
    let r = assess(&input, 1794673260).unwrap();
    assert_eq!(r["results"][0]["outcome"], "pass");
    assert_eq!(r["results"][5]["outcome"], "unknown");
}
#[test]
fn missing_owner_facts_and_expiry_never_pass() {
    let mut v = risk();
    v["entries"][0]["owner"] = Value::Null;
    v["entries"][1]["evidence"]["facts"]
        .as_object_mut()
        .unwrap()
        .remove("recipient_verified");
    let r = assess(&v, 1794673260).unwrap();
    assert_eq!(r["results"][0]["coverage"], "incomplete");
    assert_eq!(r["results"][1]["coverage"], "incomplete");
    assert_eq!(
        assess(&risk(), 1794760000).unwrap()["results"][0]["coverage"],
        "stale"
    );
    assert_eq!(
        assess(&risk(), 1794673100).unwrap()["results"][0]["coverage"],
        "incomplete"
    );
}
#[test]
fn private_content_and_malformed_claims_are_rejected() {
    let mut v = risk();
    v["message_body"] = json!("raw message");
    assert!(validate(&v).is_err());
    let mut v = risk();
    v["entries"][0]["evidence"]["facts"]["requester_verified"] = json!("true");
    assert!(validate(&v).is_err());
    let mut v = risk();
    v["entries"][1]["id"] = v["entries"][0]["id"].clone();
    assert!(validate(&v).is_err());
    let mut v = risk();
    v["entries"][0]["evidence"]["expires_at"] = json!(4102444800u64);
    assert!(validate(&v).is_err());
}
#[test]
fn native_bundle_is_reproducible() {
    let expected: Value = serde_json::from_str(include_str!(
        "../../../fixtures/frontline/team-risk.bundle.json"
    ))
    .unwrap();
    assert_eq!(assess(&risk(), 1794673200).unwrap(), expected);
}
