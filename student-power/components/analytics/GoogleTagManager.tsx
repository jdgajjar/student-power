import Script from 'next/script';

const GTM_ID = 'GTM-52LZB8C5';

/**
 * GoogleTagManagerScript
 * Renders the GTM <script> snippet using next/script with strategy="beforeInteractive"
 * so it loads as early as possible in <head>.
 * Place this component inside the <head> of the root layout.
 */
export function GoogleTagManagerScript() {
  return (
    <Script
      id="google-tag-manager"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{
        __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`,
      }}
    />
  );
}

/**
 * GoogleTagManagerNoScript
 * Renders the GTM <noscript> fallback iframe.
 * Place this component immediately after the opening <body> tag in the root layout.
 */
export function GoogleTagManagerNoScript() {
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: 'none', visibility: 'hidden' }}
      />
    </noscript>
  );
}
