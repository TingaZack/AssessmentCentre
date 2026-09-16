import "react";

declare module "react" {
  interface IframeHTMLAttributes<T> extends HTMLAttributes<T> {
    /** Loads the iframe in a partitioned, cookie-less browsing context.
     *  Chromium-only (Chrome/Edge/Brave/Opera) as of 2024–2026; other
     *  browsers ignore the attribute and load a normal iframe instead. */
    credentialless?: boolean;
  }
}
