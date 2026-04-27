/**
 * print-compat.ts
 *
 * Cross-platform PDF / printing helper.
 *
 * Why this exists:
 *   `expo-print` on web does NOT print the supplied `html` parameter — calling
 *   `Print.printAsync({ html })` triggers the OS print dialog of the *current*
 *   page, which results in a screenshot of the running app. We work around
 *   this by injecting the HTML into a hidden `<iframe>` and printing only that
 *   iframe's content window.
 *
 * On native (iOS/Android) we keep the original behaviour: render to a PDF
 * file and pass it to the share sheet so the user can save / print it.
 */

import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";

interface PrintOpts {
  /** Filename (without extension) used for the share sheet on native. */
  filename?: string;
  /** Optional dialog title shown by the share sheet. */
  dialogTitle?: string;
}

/**
 * Print arbitrary HTML to PDF / printer in a way that works on web AND native.
 * On web: opens the browser print dialog with the supplied HTML only.
 * On native: writes a PDF and opens the share sheet so the user can save it.
 */
export async function printHtml(
  html: string,
  opts: PrintOpts = {},
): Promise<void> {
  if (Platform.OS === "web") {
    return printHtmlWeb(html);
  }

  // Native: write to a real PDF file and share it (Default to A4: 595 x 842 points)
  const { uri } = await Print.printToFileAsync({ 
    html,
    width: 595,
    height: 842
  });

  let finalUri = uri;
  if (opts.filename) {
    // Sanitize filename and ensure .pdf extension
    const cleanName = opts.filename.replace(/[\/\\?%*:|"<>]/g, "-");
    finalUri = `${FileSystem.cacheDirectory}${cleanName}.pdf`;
    await FileSystem.moveAsync({ from: uri, to: finalUri });
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(finalUri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: opts.dialogTitle ?? opts.filename ?? "Bagikan PDF",
    });
  } else {
    // Fallback: at least show the system print sheet
    await Print.printAsync({ uri: finalUri });
  }
}

/**
 * Web-only implementation. Renders HTML inside a hidden iframe and triggers
 * print on that iframe's contentWindow so the resulting PDF / printout
 * contains ONLY the HTML — not the surrounding app UI.
 */
function printHtmlWeb(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("printHtml: document is not available"));
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    const cleanup = () => {
      try {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch {}
    };

    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      cleanup();
      reject(new Error("printHtml: cannot access iframe document"));
      return;
    }

    doc.open();
    // Force print-friendly defaults (no margin, fits A4) so consumers don't
    // have to repeat them in every template.
    doc.write(html);
    doc.close();

    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      reject(new Error("printHtml: cannot access iframe window"));
      return;
    }

    let printed = false;

    const triggerPrint = () => {
      if (printed) return;
      printed = true;
      try {
        win.focus();
        win.print();
      } catch (e) {
        cleanup();
        reject(e);
        return;
      }
      // Some browsers dispatch afterprint, others don't — clean up either way
      const cleanupSoon = () => setTimeout(cleanup, 600);
      win.addEventListener?.("afterprint", cleanupSoon, { once: true });
      setTimeout(cleanupSoon, 60_000); // hard cap so we never leak the iframe
      resolve();
    };

    // Wait for images / fonts in the document before invoking print so charts
    // and embedded SVGs don't appear blank.
    const ready = () => setTimeout(triggerPrint, 250);

    if (doc.readyState === "complete") {
      ready();
    } else {
      win.addEventListener("load", ready, { once: true });
      // Safety net — if `load` never fires, still try after 1.5 s
      setTimeout(ready, 1500);
    }
  });
}
