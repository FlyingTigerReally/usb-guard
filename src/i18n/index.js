/**
 * i18n resolver (shared by main / renderer)
 * ---------------------------------------------------------------
 * Usage:
 *   const { t, setLocale, getLocale } = require('./i18n');
 *   t('evt.drive_removed', { id: 'E:' });
 *
 * Notes:
 * 1. Supported locales are registered in LOCALES below;
 * 2. Falls back to English when a key is missing in the active locale;
 * 3. Placeholder format is {name}, replaced by params[name].
 */
const en = require('./locales/en');
const zhCN = require('./locales/zh-CN');

// locale code -> language pack
const LOCALES = {
  en,
  'zh-CN': zhCN,
};

// 语言切换器选项（每种语言的自称，避免互相翻译造成混淆）
const LOCALE_OPTIONS = [
  { code: 'en', labelEn: 'English', labelZh: 'English' },
  { code: 'zh-CN', labelEn: 'Chinese', labelZh: '简体中文' },
];

let current = 'en';

function setLocale(code) {
  if (LOCALES[code]) current = code;
  return current;
}

function getLocale() {
  return current;
}

/**
 * Resolve a translation key
 * @param {string} key   e.g. 'evt.drive_removed'
 * @param {object} [params] e.g. { id: 'E:' }
 * @returns {string}
 */
function t(key, params) {
  const pack = LOCALES[current] || LOCALES.en;
  let str = pack[key];
  if (str === undefined) str = en[key];
  if (str === undefined) return key; // unknown key, return as-is for debuggability
  if (params) {
    str = str.replace(/\{(\w+)\}/g, (m, name) =>
      params[name] !== undefined ? String(params[name]) : m
    );
  }
  return str;
}

module.exports = { t, setLocale, getLocale, LOCALES, LOCALE_OPTIONS };
