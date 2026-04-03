const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const YouTube = require('youtube-sr').default;

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient('https://lnjanjvnwjccfstmmtuo.supabase.co', 'sb_secret_7LpsFc69GTqOeQP-mfxivw_96rPlBSL');

app.get('/search', async (req, res) => {
    const query = req.query.q;
    try {
        const videos = await YouTube.search(query, { limit: 10, type: 'video' });
        const results = videos.map(v => ({
            title: v.title,
            thumbnail: v.thumbnail.url,
            // Capturamos el nombre del canal aquí
            channel: v.channel ? v.channel.name : "YouTube Artist",
            url: v.url
        }));
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/download', async (req, res) => {
    const { title, artist, image } = req.body;
    const uniqueId = Date.now();
    const tempName = `temp_${uniqueId}`;

    try {
        const command = `yt-dlp -x --audio-format mp3 --ffmpeg-location /usr/bin/ffmpeg -o "${outputFile}" ${videoUrl}`;

        exec(command, async (error, stdout, stderr) => {
            if (error) {
                return res.status(500).json({ error: error.message });
            }

            try {
                const files = fs.readdirSync(__dirname);
                const downloadedFile = files.find(f => f.startsWith(tempName));

                if (!downloadedFile) throw new Error("Archivo no encontrado");

                const filePath = path.join(__dirname, downloadedFile);
                const fileBuffer = fs.readFileSync(filePath);
                const ext = path.extname(downloadedFile);
                const finalName = `hq_${uniqueId}${ext}`;

                const { error: uploadError } = await supabase.storage
                    .from('Musics')
                    .upload(`scraped/${finalName}`, fileBuffer, { 
                        contentType: ext === '.m4a' ? 'audio/mp4' : 'audio/webm',
                        upsert: true
                    });

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage.from('Musics').getPublicUrl(`scraped/${finalName}`);

                await supabase.from('songs').insert([{
                    title, 
                    artist, 
                    image_url: image, 
                    audio_url: urlData.publicUrl
                }]);

                fs.unlinkSync(filePath);
                res.json({ success: true });

            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log('Servidor 320kbps listo en puerto 3000'));