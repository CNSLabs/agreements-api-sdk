const WORDMARK_URL = 'https://app.shodai.network/agreements/images/shodai-wordmark-dark.svg';
const FONT_FAMILY = '"Aeonik Pro",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
const COLOR_BACKGROUND = '#000000';
const COLOR_PANEL = '#1f1f1f';
const COLOR_BORDER = '#303030';
const COLOR_ACTION = '#dae5c5';
const COLOR_PRIMARY = '#eef6dc';
const COLOR_CARD_TEXT = '#ffffff';
const COLOR_SECONDARY = '#c8c8bf';
const COLOR_MUTED = '#a3a39b';

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function bodyToHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br/>');
}

export function wrapNotificationHtml(opts: {
  subject: string;
  title?: string;
  body: string;
  ctaUrl?: string;
  ctaLabel?: string;
  agreementName?: string;
}): string {
  const mainTitle = opts.title || opts.subject;
  const ctaBlock = opts.ctaUrl
    ? `<tr><td align="center" bgcolor="${COLOR_ACTION}" style="background-color:${COLOR_ACTION};border:1px solid ${COLOR_ACTION};padding:13px 16px;text-align:center;width:100%">
        <a href="${escapeHtml(opts.ctaUrl)}" style="color:${COLOR_BACKGROUND}!important;display:block;font-family:${FONT_FAMILY};font-size:14px;font-weight:700;line-height:20px;text-align:center;text-decoration:none!important;width:100%" target="_blank" rel="noopener noreferrer">${escapeHtml(opts.ctaLabel || 'View Agreement')}</a>
      </td></tr>`
    : '';
  const agreementBlock = opts.agreementName
    ? `<tr><td bgcolor="${COLOR_PANEL}" style="padding:16px;background-color:${COLOR_PANEL};border:1px solid ${COLOR_BORDER};color:${COLOR_CARD_TEXT}">
        <span style="color:${COLOR_CARD_TEXT};font-family:${FONT_FAMILY};font-size:16px;font-weight:700;line-height:22px;margin:0;text-decoration:none">${escapeHtml(opts.agreementName)}</span>
      </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta content="text/html; charset=UTF-8" http-equiv="Content-Type"/><meta name="x-apple-disable-message-reformatting"/></head>
<body bgcolor="${COLOR_BACKGROUND}" style="background-color:${COLOR_BACKGROUND};margin:0">
<table bgcolor="${COLOR_BACKGROUND}" border="0" width="100%" cellPadding="0" cellSpacing="0" role="presentation" align="center" style="background-color:${COLOR_BACKGROUND}">
<tbody><tr><td style="background-color:${COLOR_BACKGROUND};font-family:${FONT_FAMILY};margin:0;padding:32px 12px">
  <table bgcolor="${COLOR_BACKGROUND}" align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="max-width:520px;background-color:${COLOR_BACKGROUND};border:1px solid ${COLOR_BORDER};border-collapse:separate;margin:0 auto;width:100%">
    <tbody>
      <tr><td style="border-bottom:1px solid ${COLOR_BORDER};padding:20px 20px">
        <table width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation"><tbody><tr>
          <td style="vertical-align:middle"><img alt="Shodai" src="${WORDMARK_URL}" width="116" style="border:none;display:block;height:auto;outline:none;text-decoration:none;width:116px"/></td>
          <td style="text-align:right;vertical-align:middle"><span style="color:${COLOR_SECONDARY};display:inline-block;font-family:${FONT_FAMILY};font-size:11px;font-weight:700;line-height:16px;margin:0">AGREEMENTS</span></td>
        </tr></tbody></table>
      </td></tr>
      <tr><td style="padding:40px 32px 0">
        <p style="font-size:11px;line-height:16px;color:${COLOR_SECONDARY};font-weight:700;margin:0 0 10px">NOTIFICATION</p>
        <h1 style="font-size:35px;line-height:41px;color:${COLOR_PRIMARY};font-weight:400;margin:0;text-align:left">${escapeHtml(mainTitle)}</h1>
        ${opts.body ? `<p style="font-size:16px;line-height:22px;color:${COLOR_SECONDARY};font-weight:400;margin:14px 0 0;white-space:normal;word-break:break-word">${bodyToHtml(opts.body)}</p>` : ''}
      </td></tr>
      <tr><td style="height:28px;line-height:28px;font-size:28px">&nbsp;</td></tr>
      ${(agreementBlock || ctaBlock) ? `<tr><td style="padding:0 32px"><table width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation"><tbody>${agreementBlock}${agreementBlock && ctaBlock ? '<tr><td style="height:16px;line-height:16px;font-size:16px">&nbsp;</td></tr>' : ''}${ctaBlock}</tbody></table></td></tr><tr><td style="height:28px;line-height:28px;font-size:28px">&nbsp;</td></tr>` : ''}
      <tr><td style="padding:0 32px"><p style="font-size:12px;line-height:16px;color:${COLOR_SECONDARY};font-weight:400;margin:0;text-align:center">If you did not expect this email, you can safely ignore it.</p></td></tr>
      <tr><td style="height:24px;line-height:24px;font-size:24px">&nbsp;</td></tr>
      <tr><td style="border-top:1px solid ${COLOR_BORDER};padding:16px 32px 24px"><p style="font-size:12px;line-height:16px;color:${COLOR_MUTED};font-weight:400;margin:0;text-align:center">CNS Labs Inc.</p></td></tr>
    </tbody>
  </table>
</td></tr></tbody>
</table>
</body>
</html>`;
}
