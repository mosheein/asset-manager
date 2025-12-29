import express from 'express';
import cors from 'cors';
import path from 'path';
import accountsRouter from './routes/accounts';
import holdingsRouter from './routes/holdings';
import statementsRouter from './routes/statements';
import targetsRouter from './routes/targets';
import rebalancingRouter from './routes/rebalancing';
import historyRouter from './routes/history';
import debugRouter from './routes/debug';
import symbolMappingsRouter from './routes/symbolMappings';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/accounts', accountsRouter);
app.use('/api/holdings', holdingsRouter);
app.use('/api/statements', statementsRouter);
app.use('/api/targets', targetsRouter);
app.use('/api/rebalancing', rebalancingRouter);
app.use('/api/history', historyRouter);
app.use('/api/debug', debugRouter);
app.use('/api/symbol-mappings', symbolMappingsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

