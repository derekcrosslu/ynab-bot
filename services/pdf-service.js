/**
 * PDF Service
 *
 * Handles PDF text extraction using pdf-parse.
 */

const pdf = require('pdf-parse');

class PdfService {
    /**
     * Extract text from PDF buffer
     * @param {Buffer} pdfBuffer - PDF file buffer
     * @returns {Promise<string>} Extracted text
     */
    async extractText(pdfBuffer) {
        try {
            console.log('📄 Extrayendo texto del PDF...');
            const data = await pdf(pdfBuffer);
            console.log(`✅ Texto extraído: ${data.text.length} caracteres`);
            return data.text;
        } catch (error) {
            console.error('Error extrayendo texto del PDF:', error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new PdfService();
