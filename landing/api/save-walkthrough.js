/**
 * Vercel Serverless Function to save walkthrough.html content back to GitHub repository.
 * This will automatically trigger Vercel to rebuild and redeploy the site.
 */
module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle Options preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Phương thức không được hỗ trợ. Hãy dùng POST.' });
    return;
  }

  try {
    const { html } = req.body;
    if (!html) {
      res.status(400).json({ error: 'Nội dung HTML không được để trống.' });
      return;
    }

    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) {
      res.status(500).json({
        error: 'Chưa cấu hình GITHUB_TOKEN trên Vercel. Vui lòng vào Vercel Dashboard -> Settings -> Environment Variables, thêm GITHUB_TOKEN với giá trị là GitHub Personal Access Token của bạn.'
      });
      return;
    }

    const owner = 'lupclky';
    const repo = 'introvert-player';
    const filePath = 'landing/walkthrough.html';
    const message = 'Update walkthrough.html via Vercel online editor';

    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Vercel-Walkthrough-Editor'
    };

    // 1. Get the current file SHA to perform an update
    let sha = null;
    const customFetch = globalThis.fetch || fetch;

    const getRes = await customFetch(getUrl, { headers });
    if (getRes.status === 200) {
      const fileData = await getRes.json();
      sha = fileData.sha;
    } else if (getRes.status !== 404) {
      const errJson = await getRes.json().catch(() => ({}));
      let extraHelp = '';
      if (getRes.status === 401 || getRes.status === 403) {
        extraHelp = ' (Vui lòng kiểm tra lại quyền truy cập hoặc tính hợp lệ của GITHUB_TOKEN)';
      }
      res.status(getRes.status).json({
        error: `Không thể đọc file từ GitHub: ${errJson.message || getRes.statusText}${extraHelp}`
      });
      return;
    }

    // 2. Put the updated content back to GitHub repository
    const putRes = await customFetch(getUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message,
        content: Buffer.from(html, 'utf8').toString('base64'),
        sha
      })
    });

    const putData = await putRes.json().catch(() => ({}));
    if (putRes.ok) {
      res.status(200).json({
        success: true,
        message: 'Đã lưu thành công vào GitHub. Vercel đang tự động xây dựng lại dự án (quá trình này mất khoảng 1-2 phút)!'
      });
    } else {
      let extraHelp = '';
      if (putRes.status === 404) {
        extraHelp = ' (Lỗi này thường xảy ra do: 1. GITHUB_TOKEN không có quyền ghi (write) vào repo này; 2. Bạn vừa thêm GITHUB_TOKEN trên Vercel nhưng chưa redeploy lại dự án để biến môi trường có hiệu lực; 3. Sai tên repo/owner).';
      } else if (putRes.status === 401 || putRes.status === 403) {
        extraHelp = ' (Vui lòng kiểm tra lại quyền truy cập/ghi của GITHUB_TOKEN)';
      }
      res.status(putRes.status).json({
        error: `Lỗi khi lưu vào GitHub: ${putData.message || putRes.statusText}${extraHelp}`
      });
    }
  } catch (err) {
    console.error('Lỗi API Vercel save-walkthrough:', err);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ: ' + err.message });
  }
};
