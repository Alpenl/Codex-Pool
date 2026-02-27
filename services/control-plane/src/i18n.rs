use axum::http::{header::ACCEPT_LANGUAGE, HeaderMap};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Locale {
    En,
    ZhCn,
}

impl Locale {
    pub const fn default_locale() -> Self {
        Self::ZhCn
    }

    pub const fn message(self, en: &'static str, zh_cn: &'static str) -> &'static str {
        match self {
            Self::En => en,
            Self::ZhCn => zh_cn,
        }
    }
}

pub fn locale_from_headers(headers: &HeaderMap) -> Locale {
    headers
        .get(ACCEPT_LANGUAGE)
        .and_then(|value| value.to_str().ok())
        .map(parse_accept_language)
        .unwrap_or_else(Locale::default_locale)
}

pub fn parse_accept_language(raw: &str) -> Locale {
    for language_range in raw.split(',') {
        let normalized = language_range
            .split(';')
            .next()
            .unwrap_or_default()
            .trim()
            .replace('_', "-")
            .to_ascii_lowercase();

        if normalized.is_empty() {
            continue;
        }

        if normalized == "en" || normalized.starts_with("en-") {
            return Locale::En;
        }

        if normalized == "zh-cn" || normalized.starts_with("zh-cn") {
            return Locale::ZhCn;
        }
    }

    Locale::default_locale()
}

#[cfg(test)]
mod tests {
    use super::{parse_accept_language, Locale};

    #[test]
    fn parse_accept_language_prefers_first_supported_locale() {
        let locale = parse_accept_language("fr-FR, en-US;q=0.8, zh-CN;q=0.7");
        assert_eq!(locale, Locale::En);
    }

    #[test]
    fn parse_accept_language_handles_zh_cn_case_and_separator() {
        assert_eq!(parse_accept_language("ZH_cn"), Locale::ZhCn);
        assert_eq!(parse_accept_language("zh-CN"), Locale::ZhCn);
    }

    #[test]
    fn parse_accept_language_falls_back_to_default_locale() {
        assert_eq!(parse_accept_language("fr,ja"), Locale::ZhCn);
    }
}
