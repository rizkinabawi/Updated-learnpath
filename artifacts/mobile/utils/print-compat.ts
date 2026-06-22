/**
 * print-compat.ts
 *
 * Cross-platform PDF / printing helper.
 *
 * On native (iOS/Android): renders to a PDF file via expo-print and opens
 * the share sheet so the user can save / print it.
 *
 * On web / PWA: uses a Blob URL opened in a new tab so the browser's
 * built-in print/share dialog works correctly — including on mobile Safari
 * ("Save to Files", "Print"). The hidden-iframe approach is avoided because
 * mobile browsers block cross-origin or sandboxed iframe printing.
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
 * On web: opens the HTML in a new tab and triggers the browser print dialog.
 * On native: writes a PDF and opens the share sheet so the user can save it.
 */
export async function printHtml(
  html: string,
  opts: PrintOpts = {},
): Promise<void> {
  if (Platform.OS === "web") {
    return printHtmlWeb(html, opts.filename);
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
 * Web / PWA implementation.
 *
 * Strategy:
 * 1. Create a Blob URL from the HTML string (avoids cross-origin restrictions).
 * 2. Open it in a new tab/window.
 * 3. Once loaded, call window.print() on it.
 *
 * On desktop browsers this opens the print dialog.
 * On mobile Safari/Chrome PWA this shows the system share sheet which
 * includes "Print" and "Save to Files" options.
 *
 * If window.open() is blocked by a popup blocker, fall back to downloading
 * the HTML as a file so the user can open it manually.
 */
function printHtmlWeb(html: string, filename?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      reject(new Error("printHtml: browser APIs not available"));
      return;
    }

    try {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);

      // Try to open in a new tab
      const newWin = window.open(blobUrl, "_blank");

      if (!newWin) {
        // Popup was blocked — fall back to direct download
        _downloadHtmlFallback(blobUrl, filename ?? "learnpath-export");
        resolve();
        return;
      }

      // Wait for the new window to load, then trigger print
      const triggerPrint = () => {
        try {
          newWin.focus();
          newWin.print();
        } catch (e) {
          // Some browsers block print() on cross-origin windows — ignore,
          // the user can use the browser menu instead.
        }
        // Revoke blob URL after a delay to let the window fully load
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        resolve();
      };

      // newWin.onload fires after the blob document is ready
      newWin.onload = () => setTimeout(triggerPrint, 300);

      // Safety net in case onload never fires (some browsers skip it for blobs)
      setTimeout(triggerPrint, 1800);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Fallback: trigger a direct HTML file download when window.open() is blocked.
 * The user can open the downloaded file in their browser and print from there.
 */
function _downloadHtmlFallback(blobUrl: string, filename: string): void {
  try {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename.endsWith(".html") ? filename : `${filename}.html`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 1000);
  } catch {}
}
