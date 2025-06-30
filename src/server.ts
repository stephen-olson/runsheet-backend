 import express from 'express';
  import cors from 'cors';
  import multer from 'multer';
  import dotenv from 'dotenv';
  import path from 'path';
  import fs from 'fs';

  dotenv.config();

  const app = express();
  const port = process.env.PORT || 3001;

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const upload = multer({
    dest: 'uploads/',
    limits: {
      fileSize: 10 * 1024 * 1024,
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

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  // Upload and process documents
  app.post('/api/upload', upload.array('documents', 10), async (req, res) => {
    try {
      const files = req.files as any[];
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const results = [];

      for (const file of files) {
        const extractedText = `File: ${file.originalname}\nManual entry required.`;
        const extractedData = [];

        results.push({
          filename: file.originalname,
          extractedText,
          extractedData,
          size: file.size,
        });

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
  app.post('/api/runsheets', (req, res) => {
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
  app.get('/api/runsheets', (req, res) => {
    const allRunsheets = Array.from(runsheets.values());
    res.json({ runsheets: allRunsheets });
  });

  // Get specific runsheet
  app.get('/api/runsheets/:id', (req, res) => {
    const runsheet = runsheets.get(req.params.id);
    if (!runsheet) {
      return res.status(404).json({ error: 'Runsheet not found' });
    }
    res.json({ runsheet });
  });

  // Update runsheet
  app.put('/api/runsheets/:id', (req, res) => {
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
  app.delete('/api/runsheets/:id', (req, res) => {
    const deleted = runsheets.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Runsheet not found' });
    }
    res.json({ success: true });
  });

  // Export runsheet to CSV
  app.get('/api/runsheets/:id/export/csv', (req, res) => {
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

  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });


