const fs = require('fs');
let content = fs.readFileSync('app/token/[id].tsx', 'utf8');

const oldEffect = `  useEffect(() => {
    let mounted = true;
    const loadDetail = async () => {
      if (!id) return;
      setLoadingDetail(true);
      setFailed(false);
      const d = await getCoinDetail(id, fiat, language);
      if (mounted) {
        setDetail(d);
        setFailed(!d);
        setLoadingDetail(false);
      }
    };
    loadDetail();
    return () => { mounted = false; };
  }, [id, fiat, language]);`;

const newEffect = `  const mounted = React.useRef(true);
  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  const loadDetail = React.useCallback(async () => {
    if (!id) return;
    setLoadingDetail(true);
    setFailed(false);
    const d = await getCoinDetail(id, fiat, language);
    if (mounted.current) {
      setDetail(d);
      setFailed(!d);
      setLoadingDetail(false);
    }
  }, [id, fiat, language]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);`;

content = content.replace(oldEffect, newEffect);
fs.writeFileSync('app/token/[id].tsx', content);
