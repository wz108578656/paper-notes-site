<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script>
// 检测 notes_repo 页面，添加 body class
(function() {
    if (location.pathname.includes('/notes_repo/')) {
        document.body.classList.add('is-notes-repo-page');
    } else if (location.pathname === '/' || location.pathname === '/index.html') {
        document.body.classList.add('is-home-page');
    }
})();
</script>
</body>
</html>