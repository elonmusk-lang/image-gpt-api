const express = require('express');
const apiHandler = require('./api/generate');

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint for Railway
app.get('/', (req, res) => {
    res.json({
        status: '🚀 ImageGPT API is running!',
        endpoints: {
            documentation: '/api/generate',
            generate: '/api/generate?model=seedream-5-lite&prompt=your+prompt',
            edit: '/api/generate?model=flux-kontext-pro&prompt=your+edit&image_url=your+image+url'
        },
        models: {
            generation: ['gpt-image-2', 'gpt-image-1.5', 'nano-banana', 'nano-banana-2', 'ideogram-v3-turbo', 'seedream-4.5', 'seedream-5-lite', 'flux-pulid'],
            editing: ['gpt-image-2', 'nano-banana-2', 'flux-kontext-pro']
        },
        Developer: 'JOHN SNOW',
        Credits: 'Channel: https://t.me/ByteCoderX | Powered by FAST'
    });
});

// Route all requests through your API handler
app.use('/api/generate', apiHandler);

// Also handle root to show API docs
app.use('/', apiHandler);

// Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Local URL: http://localhost:${PORT}`);
    console.log(`📚 API Docs: http://localhost:${PORT}/api/generate`);
    console.log(`🚀 Ready for Railway deployment!`);
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});
