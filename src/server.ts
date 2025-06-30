
  {
    "name": "backend",
    "version": "1.0.0",
    "main": "index.js",
    "scripts": {
      "start": "node dist/server.js",
      "dev": "nodemon src/server.ts",
      "build": "tsc",
      "vercel-build": "npm run build",
      "test": "echo \"Error: no test specified\" && exit 1"
    },
    "keywords": [],
    "author": "",
    "license": "ISC",
    "description": "",
    "dependencies": {
      "@google-cloud/documentai": "^9.2.0",
      "@types/express": "^4.17.23",
      "@types/node": "^24.0.7",
      "cors": "^2.8.5",
      "dotenv": "^17.0.0",
      "express": "^4.21.2",
      "multer": "^2.0.1",
      "nodemon": "^3.1.10",
      "ts-node": "^10.9.2",
      "typescript": "^5.8.3"
    },
    "devDependencies": {
      "@types/cors": "^2.8.19",
      "@types/multer": "^1.4.13"
    }
  }

  11. Scroll down and click "Commit changes" (green button)

  Step 3: Add TypeScript Config

  12. Click "Add file" → "Create new file" again
  13. Filename: tsconfig.json
  14. Copy and paste this:

  {
    "compilerOptions": {
      "target": "ES2020",
      "module": "commonjs",
      "lib": ["ES2020"],
      "outDir": "./dist",
      "rootDir": "./src",
      "strict": false,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true,
      "resolveJsonModule": true,
      "moduleResolution": "node",
      "allowSyntheticDefaultImports": true,
      "experimentalDecorators": true,
      "emitDecoratorMetadata": true
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "dist"]
  }

  15. Click "Commit changes"

  Step 4: Create the src folder and server.ts

  16. Click "Add file" → "Create new file"
  17. Filename: src/server.ts (the slash creates the folder)
  18. Copy and paste this (this is your main server code):

  import express, { Request, Response } from 'express';
  import cors from 'cors';
  import multer from 'multer';
  import dotenv from 'dotenv';
  import path from 'path';
  import fs from 'fs';
  import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

  dotenv.config();

  const app = express();
  const port = process.env.PORT || 3001;

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const upload = multer({
    dest: 'uploads/',
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
  });

  interface RunsheetEntry {
    id: string;
    date: string;
    volumePage: string;
    grantor: string;
    grantee: string;
    description: string;
    documentType: string;
    consideration: string;
  }

  interface RunsheetData {
    id: string;
    title: string;
    entries: RunsheetEntry[];
    createdAt: string;
    updatedAt: string;
  }

  const runsheets: Map<string, RunsheetData> = new Map();

  // Initialize Google Cloud Document AI client
  let documentAIClient: DocumentProcessorServiceClient | null = null;

  if (process.env.GOOGLE_CLOUD_PROJECT_ID && process.env.GOOGLE_CLOUD_PROCESSOR_ID) {
    try {
      documentAIClient = new DocumentProcessorServiceClient();
    } catch (error) {
      console.warn('Document AI not initialized. OCR features will be limited.');
    }
  }

  async function processDocumentWithAI(filePath: string): Promise<string> {
    if (!documentAIClient || !process.env.GOOGLE_CLOUD_PROJECT_ID ||
  !process.env.GOOGLE_CLOUD_PROCESSOR_ID) {
      throw new Error('Document AI not configured');
    }

    const processorName = `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/locations/us/processors/${p
  rocess.env.GOOGLE_CLOUD_PROCESSOR_ID}`;

    const fileBuffer = fs.readFileSync(filePath);
    const rawDocument = {
      content: fileBuffer.toString('base64'),
      mimeType: 'application/pdf',
    };

    const request = {
      name: processorName,
      rawDocument,
    };

    const [result] = await documentAIClient.processDocument(request);
    return result.document?.text || '';
  }

  function extractLegalInformation(text: string): Partial<RunsheetEntry>[] {
    const entries: Partial<RunsheetEntry>[] = [];
    const lines = text.split('\n');

    let currentEntry: Partial<RunsheetEntry> = {};

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Date pattern (MM/DD/YYYY or MM-DD-YYYY)
      const dateMatch = trimmedLine.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
      if (dateMatch) {
        if (Object.keys(currentEntry).length > 0) {
          entries.push(currentEntry);
          currentEntry = {};
        }
        currentEntry.date = dateMatch[1];
      }

      // Volume/Page pattern (Book XX Page YY or Vol XX Pg YY)
      const volumePageMatch = trimmedLine.match(/(Book|Vol|Volume)\s*(\d+)\s*(Page|Pg|P)\s*(\d+)/i);
      if (volumePageMatch) {
        currentEntry.volumePage = `${volumePageMatch[2]}/${volumePageMatch[4]}`;
      }

      // Document type detection
      const documentTypes = ['DEED', 'LEASE', 'MORTGAGE', 'ASSIGNMENT', 'RELEASE', 'EASEMENT', 'RIGHT 
  OF WAY'];
      for (const docType of documentTypes) {
        if (trimmedLine.toUpperCase().includes(docType)) {
          currentEntry.documentType = docType;
          break;
        }
      }

      // Consideration amount pattern ($X,XXX.XX)
      const considerationMatch = trimmedLine.match(/\$[\d,]+\.?\d*/);
      if (considerationMatch) {
        currentEntry.consideration = considerationMatch[0];
      }

      // Names detection (basic pattern for grantor/grantee)
      if (trimmedLine.includes(' TO ') || trimmedLine.includes(' to ')) {
        const parts = trimmedLine.split(/ TO | to /i);
        if (parts.length === 2) {
          currentEntry.grantor = parts[0].trim();
          currentEntry.grantee = parts[1].trim();
        }
      }
    }

    if (Object.keys(currentEntry).length > 0) {
      entries.push(currentEntry);
    }

    return entries;
  }

  // API Routes

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  // Upload and process documents
  app.post('/api/upload', upload.array('documents', 10), async (req: Request, res: Response) => {
    try {
      const files = req.files as any[];
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const results = [];

      for (const file of files) {
        let extractedText = '';

        if (documentAIClient) {
          try {
            extractedText = await processDocumentWithAI(file.path);
          } catch (error) {
            console.error('Document AI processing failed:', error);
            extractedText = `File: ${file.originalname}\nProcessing failed. Manual entry required.`;
          }
        } else {
          extractedText = `File: ${file.originalname}\nOCR not configured. Manual entry required.`;
        }

        const extractedData = extractLegalInformation(extractedText);

        results.push({
          filename: file.originalname,
          extractedText,
          extractedData,
          size: file.size,
        });

        // Clean up uploaded file
        fs.unlinkSync(file.path);
      }

      res.json({
        success: true,
        results,
      });
    } catch (error) {
      console.error('Upload processing error:', error);
      res.status(500).json({ error: 'Failed to process documents' });
    }
  });

  // Create new runsheet
  app.post('/api/runsheets', (req: Request, res: Response) => {
    try {
      const { title, entries } = req.body;

      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }

      const id = Date.now().toString();
      const runsheet: RunsheetData = {
        id,
        title,
        entries: entries || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      runsheets.set(id, runsheet);

      res.json({ success: true, runsheet });
    } catch (error) {
      console.error('Create runsheet error:', error);
      res.status(500).json({ error: 'Failed to create runsheet' });
    }
  });

  // Get all runsheets
  app.get('/api/runsheets', (req: Request, res: Response) => {
    const allRunsheets = Array.from(runsheets.values());
    res.json({ runsheets: allRunsheets });
  });

  // Get specific runsheet
  app.get('/api/runsheets/:id', (req: Request, res: Response) => {
    const runsheet = runsheets.get(req.params.id);
    if (!runsheet) {
      return res.status(404).json({ error: 'Runsheet not found' });
    }
    res.json({ runsheet });
  });

  // Update runsheet
  app.put('/api/runsheets/:id', (req: Request, res: Response) => {
    try {
      const runsheet = runsheets.get(req.params.id);
      if (!runsheet) {
        return res.status(404).json({ error: 'Runsheet not found' });
      }

      const { title, entries } = req.body;

      if (title) runsheet.title = title;
      if (entries) runsheet.entries = entries;
      runsheet.updatedAt = new Date().toISOString();

      runsheets.set(req.params.id, runsheet);

      res.json({ success: true, runsheet });
    } catch (error) {
      console.error('Update runsheet error:', error);
      res.status(500).json({ error: 'Failed to update runsheet' });
    }
  });

  // Delete runsheet
  app.delete('/api/runsheets/:id', (req: Request, res: Response) => {
    const deleted = runsheets.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Runsheet not found' });
    }
    res.json({ success: true });
  });

  // Export runsheet to CSV
  app.get('/api/runsheets/:id/export/csv', (req: Request, res: Response) => {
    const runsheet = runsheets.get(req.params.id);
    if (!runsheet) {
      return res.status(404).json({ error: 'Runsheet not found' });
    }

    const csvHeader = 'Date,Volume/Page,Grantor,Grantee,Description,Document Type,Consideration\n';
    const csvRows = runsheet.entries.map(entry =>
      `"${entry.date || ''}","${entry.volumePage || ''}","${entry.grantor || ''}","${entry.grantee || 
  ''}","${entry.description || ''}","${entry.documentType || ''}","${entry.consideration || ''}"`
    ).join('\n');

    const csv = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${runsheet.title}.csv"`);
    res.send(csv);
  });

  // Create uploads directory if it doesn't exist
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Document AI configured: ${documentAIClient ? 'Yes' : 'No'}`);
  });
