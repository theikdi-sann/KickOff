import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { invokeFunction } from './functions';

interface ReceiptResponse {
  url: string;
  path: string;
  expiresIn: number;
}

/**
 * Requests a signed receipt URL from the Edge Function, downloads the PDF into
 * the cache directory, and opens the OS share sheet.
 */
export async function downloadAndShareReceipt(orderId: string): Promise<string> {
  const receipt = await invokeFunction<ReceiptResponse>('receipt', {
    method: 'POST',
    body: { orderId },
  });

  const destination = new File(Paths.cache, `xclub-receipt-${orderId}.pdf`);
  const downloaded = await File.downloadFileAsync(receipt.url, destination, {
    idempotent: true,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(downloaded.uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'XClub receipt',
      UTI: 'com.adobe.pdf',
    });
  }

  return downloaded.uri;
}
