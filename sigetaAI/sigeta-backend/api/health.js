export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res.json({
    status: 'healthy',
    service: 'SIGETA AI Server',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    version: '1.0.0'
  });
}