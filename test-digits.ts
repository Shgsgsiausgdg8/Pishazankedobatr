function toEnglish(str: string) {
    if (!str) return str;
    return str.replace(/[۰-۹]/g, (d: string) => String.fromCharCode(d.charCodeAt(0) - 1728)).replace(/[٠-٩]/g, (d: string) => String.fromCharCode(d.charCodeAt(0) - 1584));
}

const p = toEnglish("۰۹۲۳۳۱۲۱۵۰۰");
const c = toEnglish("۱۲۳۴۵");

console.log({ p, c });
