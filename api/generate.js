const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const https = require('https');
const http = require('http');
const axios = require('axios');
const FormData = require('form-data');

// Model configurations with default dimensions
const MODEL_CONFIGS = {
  // Image Generation Models
  'gpt-image-2': { defaultWidth: 1024, defaultHeight: 1024, type: 'generate' },
  'gpt-image-1.5': { defaultWidth: 1024, defaultHeight: 1024, type: 'generate' },
  'nano-banana': { defaultWidth: 1024, defaultHeight: 1024, type: 'generate' },
  'nano-banana-2': { defaultWidth: 1024, defaultHeight: 1024, type: 'generate' },
  'ideogram-v3-turbo': { defaultWidth: 1024, defaultHeight: 1024, type: 'generate' },
  'seedream-4.5': { defaultWidth: 1024, defaultHeight: 1024, type: 'generate' },
  'seedream-5-lite': { defaultWidth: 1024, defaultHeight: 1024, type: 'generate' },
  'flux-pulid': { defaultWidth: 1024, defaultHeight: 1024, type: 'generate' },
  // Image Editing Models
  'flux-kontext-pro': { defaultWidth: 1024, defaultHeight: 1024, type: 'edit' },
};

function generateRandomIP() {
    const ranges = [
        [1, 1], [2, 2], [5, 5], [23, 23], [27, 27], [31, 31], [36, 36], [37, 37], [39, 39], [42, 42],
        [46, 46], [49, 49], [50, 50], [60, 60], [114, 114], [117, 117], [118, 118], [119, 119], [120, 120],
        [121, 121], [122, 122], [123, 123], [124, 124], [125, 125], [126, 126], [180, 180], [182, 182], [183, 183]
    ];
    const range = ranges[Math.floor(Math.random() * ranges.length)];
    const ip = [
        range[0],
        Math.floor(Math.random() * 256),
        Math.floor(Math.random() * 256),
        Math.floor(Math.random() * 256)
    ].join('.');
    return ip;
}

async function getGuestId(spoofedIp) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 9; CPH2083 Build/PPR1.180610.011) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.179 Mobile Safari/537.36',
        'X-Forwarded-For': spoofedIp,
        'X-Real-IP': spoofedIp,
        'Client-IP': spoofedIp,
        'True-Client-IP': spoofedIp,
        'X-Originating-IP': spoofedIp,
        'X-Cluster-Client-IP': spoofedIp,
        'Forwarded': `for=${spoofedIp}`
    };
    
    const response = await fetch('https://imagegpt.org/app/photo/generator', {
        headers
    });
    
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
        const match = setCookie.match(/guest_id=([^;]+)/);
        if (match) {
            return match[1];
        }
    }
    return null;
}

async function imageToBase64(inputPath) {
    let buffer;
    
    if (inputPath.startsWith('http://') || inputPath.startsWith('https://')) {
        buffer = await downloadFile(inputPath, null);
    } else {
        buffer = await fs.readFile(inputPath);
    }
    
    const { fileTypeFromBuffer } = await import('file-type');
    const type = await fileTypeFromBuffer(buffer);
    const mime = type ? type.mime : 'image/jpeg';
    const base64Data = buffer.toString('base64');
    return `data:${mime};base64,${base64Data}`;
}

async function downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        
        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            
            if (response.statusCode === 301 || response.statusCode === 302) {
                downloadFile(response.headers.location, outputPath)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer);
            });
            response.on('error', reject);
        }).on('error', reject);
    });
}

async function uploadToHost(buffer, fileExt) {
    const form = new FormData();
    const tempPath = path.join('/tmp', `temp_${Date.now()}.${fileExt}`);
    
    await fs.writeFile(tempPath, buffer);
    
    form.append("files[]", fsSync.createReadStream(tempPath), {
        filename: path.basename(tempPath)
    });

    try {
        const res = await axios.post('https://pone.rs/upload.php', form, {
            headers: {
                ...form.getHeaders(),
                "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
                "accept": "*/*",
                "origin": "https://pone.rs",
                "referer": "https://pone.rs/"
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            validateStatus: () => true
        });

        await fs.unlink(tempPath).catch(() => {});

        const data = res.data;
        const url = data?.files?.[0]?.url?.replaceAll("\\/", "/") || null;

        return {
            success: Boolean(data?.success && url),
            url: url,
            status: res.status
        };
    } catch (err) {
        await fs.unlink(tempPath).catch(() => {});
        return {
            success: false,
            url: null,
            error: err.message
        };
    }
}

async function generateImage(model, prompt, negative_prompt = "", width, height) {
    const spoofedIp = generateRandomIP();
    const guestId = await getGuestId(spoofedIp);
    const cookie = guestId ? `guest_id=${guestId};` : '';
    
    const body = {
        prompt,
        negative_prompt,
        model,
        style: "none",
        num_images: 1,
        quality: "auto"
    };

    if (width && height) {
        body.width = width;
        body.height = height;
    }

    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 9; CPH2083 Build/PPR1.180610.011) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.179 Mobile Safari/537.36',
        'Referer': 'https://imagegpt.org/app/photo/generator',
        'X-Forwarded-For': spoofedIp,
        'X-Real-IP': spoofedIp,
        'Client-IP': spoofedIp,
        'True-Client-IP': spoofedIp,
        'X-Originating-IP': spoofedIp,
        'X-Cluster-Client-IP': spoofedIp,
        'Forwarded': `for=${spoofedIp}`,
        'Cookie': cookie
    };

    const response = await fetch('https://imagegpt.org/api/generate', {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.success || !data.images || data.images.length === 0) {
        throw new Error('Failed to generate image');
    }

    let fileUrl = data.images[0];
    
    // Handle base64 response (for gpt-image-2 and gpt-image-1.5)
    if (fileUrl && fileUrl.startsWith('data:')) {
        const base64Match = fileUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (base64Match) {
            const base64Data = base64Match[2];
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Detect file type
            let fileExt = 'jpg';
            try {
                const { fileTypeFromBuffer } = await import('file-type');
                const detectedType = await fileTypeFromBuffer(buffer);
                if (detectedType && detectedType.ext) {
                    fileExt = detectedType.ext;
                }
            } catch (e) {
                // Use default
            }
            
            const uploadResult = await uploadToHost(buffer, fileExt);
            if (uploadResult.success && uploadResult.url) {
                return uploadResult.url;
            }
            throw new Error('Failed to upload image to host');
        }
        throw new Error('Invalid base64 data URL format');
    }
    
    return fileUrl;
}

async function editImage(model, prompt, imageUrl, negative_prompt = "", width, height) {
    const spoofedIp = generateRandomIP();
    const guestId = await getGuestId(spoofedIp);
    const cookie = guestId ? `guest_id=${guestId};` : '';
    
    const body = {
        prompt,
        negative_prompt,
        model,
        style: "none",
        num_images: 1,
        quality: "auto",
        image: await imageToBase64(imageUrl)
    };

    if (width && height) {
        body.width = width;
        body.height = height;
    }

    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 9; CPH2083 Build/PPR1.180610.011) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.179 Mobile Safari/537.36',
        'Referer': 'https://imagegpt.org/app/photo/generator',
        'X-Forwarded-For': spoofedIp,
        'X-Real-IP': spoofedIp,
        'Client-IP': spoofedIp,
        'True-Client-IP': spoofedIp,
        'X-Originating-IP': spoofedIp,
        'X-Cluster-Client-IP': spoofedIp,
        'Forwarded': `for=${spoofedIp}`,
        'Cookie': cookie
    };

    const response = await fetch('https://imagegpt.org/api/edit', {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.success || !data.images || data.images.length === 0) {
        throw new Error('Failed to edit image');
    }

    let fileUrl = data.images[0];
    
    // Handle base64 response
    if (fileUrl && fileUrl.startsWith('data:')) {
        const base64Match = fileUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (base64Match) {
            const base64Data = base64Match[2];
            const buffer = Buffer.from(base64Data, 'base64');
            
            let fileExt = 'jpg';
            try {
                const { fileTypeFromBuffer } = await import('file-type');
                const detectedType = await fileTypeFromBuffer(buffer);
                if (detectedType && detectedType.ext) {
                    fileExt = detectedType.ext;
                }
            } catch (e) {}
            
            const uploadResult = await uploadToHost(buffer, fileExt);
            if (uploadResult.success && uploadResult.url) {
                return uploadResult.url;
            }
            throw new Error('Failed to upload edited image to host');
        }
        throw new Error('Invalid base64 data URL format');
    }
    
    return fileUrl;
}

// API Documentation HTML - Mobile Responsive
function getApiDocs() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes">
    <title>ImageGPT API Documentation</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
        }
        body {
            font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
            color: #e0e0e0;
            min-height: 100vh;
            padding: 16px;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        .container {
            max-width: 1000px;
            margin: 0 auto;
            background: rgba(255,255,255,0.05);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 20px 16px;
            border: 1px solid rgba(255,255,255,0.08);
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .header {
            text-align: center;
            margin-bottom: 28px;
            border-bottom: 2px solid rgba(100, 200, 255, 0.2);
            padding-bottom: 20px;
        }
        .header h1 {
            font-size: 2.2em;
            background: linear-gradient(135deg, #64c8ff, #ff6b6b);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            letter-spacing: -0.5px;
            word-break: break-word;
        }
        .header p {
            color: #aaa;
            margin-top: 8px;
            font-size: 1em;
        }
        .badge {
            display: inline-block;
            background: rgba(100, 200, 255, 0.15);
            border: 1px solid rgba(100, 200, 255, 0.3);
            color: #64c8ff;
            padding: 4px 14px;
            border-radius: 20px;
            font-size: 0.8em;
            margin-top: 8px;
        }
        .badge-dev {
            background: rgba(255, 107, 107, 0.15);
            border-color: rgba(255, 107, 107, 0.3);
            color: #ff6b6b;
        }
        .section {
            margin-bottom: 24px;
            background: rgba(0,0,0,0.3);
            border-radius: 12px;
            padding: 18px 16px;
            border-left: 3px solid #64c8ff;
            overflow: hidden;
        }
        .section h2 {
            color: #64c8ff;
            margin-bottom: 12px;
            font-size: 1.2em;
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .section h3 {
            color: #ffd93d;
            margin: 14px 0 10px 0;
            font-size: 1em;
        }
        .model-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 8px;
            margin: 10px 0;
        }
        .model-tag {
            background: rgba(100, 200, 255, 0.08);
            border: 1px solid rgba(100, 200, 255, 0.15);
            border-radius: 8px;
            padding: 6px 12px;
            font-family: 'Courier New', monospace;
            font-size: 0.75em;
            color: #64c8ff;
            text-align: center;
            word-break: break-all;
            transition: all 0.2s ease;
        }
        .model-tag:active {
            transform: scale(0.95);
        }
        .model-tag.edit {
            border-color: #ff6b6b;
            color: #ff6b6b;
            background: rgba(255, 107, 107, 0.08);
        }
        .param-table-wrap {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            margin: 10px -4px;
            padding: 0 4px;
        }
        .param-table {
            width: 100%;
            min-width: 320px;
            border-collapse: collapse;
            font-size: 0.85em;
        }
        .param-table th {
            background: rgba(100, 200, 255, 0.08);
            padding: 8px 10px;
            text-align: left;
            border: 1px solid rgba(255,255,255,0.06);
            font-weight: 600;
            color: #aaa;
            font-size: 0.8em;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .param-table td {
            padding: 8px 10px;
            border: 1px solid rgba(255,255,255,0.04);
            vertical-align: middle;
            word-break: break-word;
        }
        .param-table tr:active {
            background: rgba(255,255,255,0.02);
        }
        .required {
            color: #ff6b6b;
            font-weight: 600;
        }
        .optional {
            color: #ffd93d;
        }
        .code-block {
            background: rgba(0,0,0,0.5);
            border-radius: 8px;
            padding: 12px;
            margin: 8px 0;
            font-family: 'Courier New', monospace;
            font-size: 0.75em;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            border: 1px solid rgba(255,255,255,0.04);
            word-break: break-all;
            line-height: 1.6;
        }
        .code-block .url {
            color: #64c8ff;
        }
        .code-block .param {
            color: #ffd93d;
        }
        .code-block .value {
            color: #6fcf97;
        }
        .response-example {
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            padding: 12px;
            margin: 8px 0;
            font-family: 'Courier New', monospace;
            font-size: 0.7em;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            color: #6fcf97;
            white-space: pre-wrap;
            word-break: break-all;
            line-height: 1.5;
        }
        .example {
            background: rgba(100, 200, 255, 0.04);
            border-radius: 8px;
            padding: 10px;
            margin: 6px 0;
        }
        .example .label {
            color: #aaa;
            font-size: 0.8em;
            margin-bottom: 4px;
        }
        .footer {
            text-align: center;
            margin-top: 28px;
            padding-top: 20px;
            border-top: 1px solid rgba(255,255,255,0.05);
            color: #666;
        }
        .footer a {
            color: #64c8ff;
            text-decoration: none;
            word-break: break-all;
        }
        .footer a:active {
            opacity: 0.7;
        }
        .developer {
            color: #ffd93d;
            font-size: 1em;
            margin-top: 8px;
        }
        .credits {
            color: #aaa;
            font-size: 0.85em;
            margin-top: 4px;
        }
        .note-list {
            list-style: none;
            padding: 0;
        }
        .note-list li {
            padding: 6px 0;
            border-bottom: 1px solid rgba(255,255,255,0.03);
            font-size: 0.9em;
            line-height: 1.5;
        }
        .note-list li:last-child {
            border-bottom: none;
        }
        /* Touch-friendly improvements */
        button, a, .model-tag {
            touch-action: manipulation;
        }
        @media (max-width: 480px) {
            body { padding: 10px; }
            .container { padding: 14px 12px; border-radius: 12px; }
            .header h1 { font-size: 1.6em; }
            .section { padding: 14px 12px; }
            .model-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); }
            .param-table { font-size: 0.75em; min-width: 280px; }
            .param-table th, .param-table td { padding: 6px 8px; }
            .code-block { font-size: 0.65em; padding: 10px; }
            .response-example { font-size: 0.6em; padding: 10px; }
        }
        @media (max-width: 380px) {
            .model-grid { grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); }
            .param-table { font-size: 0.7em; min-width: 240px; }
            .badge { font-size: 0.7em; padding: 3px 10px; }
        }
        @media (min-width: 768px) {
            .container { padding: 40px; }
            .section { padding: 25px; }
            .param-table { font-size: 0.95em; }
            .code-block { font-size: 0.85em; }
        }
        /* Dark mode scrollbar */
        ::-webkit-scrollbar {
            width: 4px;
            height: 4px;
        }
        ::-webkit-scrollbar-track {
            background: rgba(255,255,255,0.05);
            border-radius: 2px;
        }
        ::-webkit-scrollbar-thumb {
            background: rgba(100, 200, 255, 0.3);
            border-radius: 2px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎨 ImageGPT API</h1>
            <p>Generate &amp; Edit Images with AI</p>
            <div style="margin-top: 10px; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px;">
                <span class="badge">⚡ Free &amp; Unlimited</span>
                <span class="badge badge-dev">👨‍💻 Developer: JOHN SNOW</span>
            </div>
        </div>

        <div class="section">
            <h2>🌐 Base URL</h2>
            <div class="code-block">
                <span class="url">https://your-railway-app.railway.app/api/generate</span>
            </div>
        </div>

        <div class="section">
            <h2>📸 Image Generation Models</h2>
            <div class="model-grid">
                <div class="model-tag">gpt-image-2</div>
                <div class="model-tag">gpt-image-1.5</div>
                <div class="model-tag">nano-banana</div>
                <div class="model-tag">nano-banana-2</div>
                <div class="model-tag">ideogram-v3-turbo</div>
                <div class="model-tag">seedream-4.5</div>
                <div class="model-tag">seedream-5-lite</div>
                <div class="model-tag">flux-pulid</div>
            </div>
            <p style="color: #aaa; margin-top: 8px; font-size: 0.85em;">Default size: 1024x1024</p>
        </div>

        <div class="section">
            <h2>🖼️ Image Editing Models</h2>
            <div class="model-grid">
                <div class="model-tag edit">gpt-image-2</div>
                <div class="model-tag edit">nano-banana-2</div>
                <div class="model-tag edit">flux-kontext-pro</div>
            </div>
            <p style="color: #aaa; margin-top: 8px; font-size: 0.85em;">Default size: 1024x1024</p>
        </div>

        <div class="section">
            <h2>📋 Parameters</h2>
            
            <h3>📸 For Image Generation</h3>
            <div class="param-table-wrap">
                <table class="param-table">
                    <thead>
                        <tr>
                            <th>Parameter</th>
                            <th>Type</th>
                            <th>Required</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>model</code></td>
                            <td>string</td>
                            <td><span class="required">✅ Yes</span></td>
                            <td>Model name from generation list</td>
                        </tr>
                        <tr>
                            <td><code>prompt</code></td>
                            <td>string</td>
                            <td><span class="required">✅ Yes</span></td>
                            <td>Text description of desired image</td>
                        </tr>
                        <tr>
                            <td><code>negative_prompt</code></td>
                            <td>string</td>
                            <td><span class="optional">❌ No</span></td>
                            <td>What to avoid in generation</td>
                        </tr>
                        <tr>
                            <td><code>width</code></td>
                            <td>number</td>
                            <td><span class="optional">❌ No</span></td>
                            <td>Image width (default: 1024)</td>
                        </tr>
                        <tr>
                            <td><code>height</code></td>
                            <td>number</td>
                            <td><span class="optional">❌ No</span></td>
                            <td>Image height (default: 1024)</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <h3>🖼️ For Image Editing</h3>
            <div class="param-table-wrap">
                <table class="param-table">
                    <thead>
                        <tr>
                            <th>Parameter</th>
                            <th>Type</th>
                            <th>Required</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>model</code></td>
                            <td>string</td>
                            <td><span class="required">✅ Yes</span></td>
                            <td>Model name from editing list</td>
                        </tr>
                        <tr>
                            <td><code>prompt</code></td>
                            <td>string</td>
                            <td><span class="required">✅ Yes</span></td>
                            <td>Description of desired edit</td>
                        </tr>
                        <tr>
                            <td><code>image_url</code></td>
                            <td>string</td>
                            <td><span class="required">✅ Yes</span></td>
                            <td>URL of image to edit</td>
                        </tr>
                        <tr>
                            <td><code>negative_prompt</code></td>
                            <td>string</td>
                            <td><span class="optional">❌ No</span></td>
                            <td>What to avoid in editing</td>
                        </tr>
                        <tr>
                            <td><code>width</code></td>
                            <td>number</td>
                            <td><span class="optional">❌ No</span></td>
                            <td>Output width (default: 1024)</td>
                        </tr>
                        <tr>
                            <td><code>height</code></td>
                            <td>number</td>
                            <td><span class="optional">❌ No</span></td>
                            <td>Output height (default: 1024)</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="section">
            <h2>🔗 Sample Endpoints</h2>
            
            <h3>📸 Image Generation</h3>
            <div class="example">
                <div class="label">Simple Generation:</div>
                <div class="code-block" style="font-size: 0.7em;">
                    /api/generate?<span class="param">model</span>=<span class="value">seedream-5-lite</span>&amp;<span class="param">prompt</span>=<span class="value">A+beautiful+sunset+over+mountains</span>&amp;<span class="param">width</span>=<span class="value">1024</span>&amp;<span class="param">height</span>=<span class="value">768</span>&amp;<span class="param">negative_prompt</span>=<span class="value">blurry</span>
                </div>
            </div>

            <h3>🖼️ Image Editing</h3>
            <div class="example">
                <div class="label">Style Transfer:</div>
                <div class="code-block" style="font-size: 0.7em;">
                    /api/generate?<span class="param">model</span>=<span class="value">flux-kontext-pro</span>&amp;<span class="param">prompt</span>=<span class="value">Make+it+look+like+a+watercolor+painting</span>&amp;<span class="param">image_url</span>=<span class="value">https%3A%2F%2Fexample.com%2Fimage.jpg</span>&amp;<span class="param">width</span>=<span class="value">1024</span>&amp;<span class="param">height</span>=<span class="value">768</span>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>📤 Response Format</h2>
            <div class="response-example">
{
  "success": true,
  "url": "https://v3b.fal.media/files/.../image.png",
  "model": "seedream-5-lite",
  "action": "generate",
  "Developer": "JOHN SNOW",
  "Credits": "Channel: https://t.me/ByteCoderX | Powered by FAST"
}
            </div>
            <div class="response-example" style="color: #ff6b6b; margin-top: 8px;">
{
  "success": false,
  "error": "Model 'invalid-model' is not supported"
}
            </div>
        </div>

        <div class="section">
            <h2>⚠️ Important Notes</h2>
            <ul class="note-list">
                <li><strong>Default Dimensions:</strong> All models default to 1024x1024 if width/height not specified</li>
                <li><strong>URL Encoding:</strong> Always URL-encode your prompts and image URLs</li>
                <li><strong>Image Editing:</strong> image_url parameter is required for edit actions</li>
                <li><strong>Negative Prompt:</strong> Optional but recommended for better results</li>
            </ul>
        </div>

        <div class="footer">
            <div class="developer">👨‍💻 Developer: JOHN SNOW</div>
            <div class="credits">📢 Channel: <a href="https://t.me/ByteCoderX">https://t.me/ByteCoderX</a> | ⚡ Powered by FAST</div>
            <div style="margin-top: 12px; font-size: 0.7em; color: #444;">© 2026 ImageGPT API • All rights reserved</div>
        </div>
    </div>
</body>
</html>
    `;
}

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed. Use GET.' });
    }

    try {
        const { model, prompt, image_url, negative_prompt, width, height } = req.query;

        // If no parameters provided, show API documentation
        if (!model && !prompt && !image_url) {
            res.setHeader('Content-Type', 'text/html');
            return res.status(200).send(getApiDocs());
        }

        // Check if model exists
        if (!model) {
            return res.status(400).json({ error: 'Model parameter is required' });
        }

        // Check if model is supported
        if (!MODEL_CONFIGS[model]) {
            return res.status(400).json({ 
                error: `Model '${model}' is not supported`,
                supported_models: Object.keys(MODEL_CONFIGS)
            });
        }

        const config = MODEL_CONFIGS[model];
        const isEdit = config.type === 'edit';

        // Validate required parameters
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt parameter is required' });
        }

        if (isEdit && !image_url) {
            return res.status(400).json({ error: 'Image URL is required for edit models' });
        }

        // Use default dimensions if not provided
        const finalWidth = width ? parseInt(width) : config.defaultWidth;
        const finalHeight = height ? parseInt(height) : config.defaultHeight;

        let result;
        if (isEdit) {
            result = await editImage(model, prompt, image_url, negative_prompt || "", finalWidth, finalHeight);
        } else {
            result = await generateImage(model, prompt, negative_prompt || "", finalWidth, finalHeight);
        }

        return res.status(200).json({
            success: true,
            url: result,
            model: model,
            action: isEdit ? 'edit' : 'generate',
            Developer: "JOHN SNOW",
            Credits: "Channel: https://t.me/ByteCoderX | Powered by FAST"
        });

    } catch (error) {
        console.error('Error:', error.message);
        return res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};
