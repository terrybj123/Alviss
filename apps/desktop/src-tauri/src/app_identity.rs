//! Which installation is this? The release app, the isolated dev build and a
//! Labs build of a feature branch run side by side on one machine, each with
//! its own Tauri identifier (`tauri.conf.json`, `tauri.dev.conf.json`,
//! `tauri.labs.conf.json`). The identifier already separates app data, the
//! WebView profile and the single-instance lock. Two things did NOT follow it
//! and are derived here instead:
//!
//! - the OS keychain service, so two installations opening the same vault do
//!   not read and rotate the same sync and OAuth tokens without a cross-process
//!   lock (ADR 0015, installation-local OAuth);
//! - the window title, so the three are never confused on screen.

/// The identifier of the published desktop app (`tauri.conf.json`).
pub const RELEASE_IDENTIFIER: &str = "com.alviss.desktop";

/// The keychain service name for an installation. Every identity gets its own
/// namespace; the release app uses the bare product name.
pub fn keychain_service_for(identifier: &str) -> String {
    if identifier == RELEASE_IDENTIFIER {
        "alviss".to_string()
    } else {
        format!("alviss:{identifier}")
    }
}

/// The window title of a non-release installation, `None` for the release app.
pub fn window_title_for(identifier: &str) -> Option<&'static str> {
    if identifier.ends_with(".dev") {
        Some("Alviss (Dev)")
    } else if identifier.ends_with(".labs") {
        Some("Alviss Labs")
    } else {
        None
    }
}

/// The variable a package manager sets when IT updates this installation, e.g.
/// `ALVISS_UPDATES_MANAGED_BY=Nix` from a distribution package wrapper. Such a
/// copy carries the release identifier but lives where the app cannot write, so
/// it must neither offer nor try to install a release over itself.
pub const UPDATES_MANAGED_BY_VAR: &str = "ALVISS_UPDATES_MANAGED_BY";

/// The name of the package manager that updates this installation, or `None`
/// when Alviss updates itself. The value is shown in the settings, so it is
/// trimmed, must be a short single line, and an empty one counts as unset.
pub fn updates_managed_by_from(value: Option<&str>) -> Option<String> {
    let name = value?.trim();
    if name.is_empty() {
        return None;
    }
    if name.chars().count() > 40 || name.chars().any(char::is_control) {
        // Set, but not a name to show: still managed, under a neutral word.
        return Some("package manager".to_string());
    }
    Some(name.to_string())
}

/// `None` when this installation updates itself (`appUpdate.ts` asks before
/// every update check).
#[tauri::command]
pub fn app_updates_managed_by() -> Option<String> {
    updates_managed_by_from(std::env::var(UPDATES_MANAGED_BY_VAR).ok().as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_package_manager_that_sets_the_variable_owns_the_updates() {
        assert_eq!(updates_managed_by_from(Some("Nix")), Some("Nix".to_string()));
        assert_eq!(updates_managed_by_from(Some("  Nix \n")), Some("Nix".to_string()));
    }

    #[test]
    fn without_the_variable_the_app_updates_itself() {
        assert_eq!(updates_managed_by_from(None), None);
        assert_eq!(updates_managed_by_from(Some("")), None);
        assert_eq!(updates_managed_by_from(Some("   ")), None);
    }

    #[test]
    fn a_value_that_is_no_short_name_still_switches_the_updater_off() {
        let long = "x".repeat(41);
        assert_eq!(updates_managed_by_from(Some(&long)), Some("package manager".to_string()));
        assert_eq!(updates_managed_by_from(Some("Nix\u{7}")), Some("package manager".to_string()));
    }

    #[test]
    fn the_release_app_keeps_its_keychain_entries() {
        assert_eq!(keychain_service_for("com.alviss.desktop"), "alviss");
    }

    #[test]
    fn every_other_installation_gets_its_own_keychain_namespace() {
        assert_eq!(keychain_service_for("com.alviss.desktop.dev"), "alviss:com.alviss.desktop.dev");
        assert_eq!(keychain_service_for("com.alviss.desktop.labs"), "alviss:com.alviss.desktop.labs");
        assert_ne!(
            keychain_service_for("com.alviss.desktop.dev"),
            keychain_service_for("com.alviss.desktop.labs")
        );
    }

    #[test]
    fn only_dev_and_labs_windows_are_relabelled() {
        assert_eq!(window_title_for("com.alviss.desktop"), None);
        assert_eq!(window_title_for("com.alviss.desktop.dev"), Some("Alviss (Dev)"));
        assert_eq!(window_title_for("com.alviss.desktop.labs"), Some("Alviss Labs"));
    }
}
