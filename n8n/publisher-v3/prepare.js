// PREPARE — runs for posts due in the next 30 minutes (Praveen, 22 Oct: "if it is
// going at 5:30, the file will be sent to Instagram by 5 o'clock"). Sends the
// creative to Instagram and Facebook ahead of time and waits for them to finish
// processing; NEVER publishes. The publish step at the post's time then only has to
// press "post". Everything sent is kept on the row in custom.prep, stamped with a
// fingerprint of what was sent — if the caption, creative, cover, collaborators,
// format, channels or account change afterwards, the publish step sees a different
// fingerprint and ignores the prepared upload.
//
// One short look per post per run (the run is every minute), and nothing new is
// started once the run is 40 s old, so two runs never prepare the same post at once.
const lp = $('Load Pages').all() || [];
let pages = [];
for (const it of lp) { if (it.json && Array.isArray(it.json.data)) pages = pages.concat(it.json.data); }
const pageByName = {}; const igByUser = {};
for (const p of pages) { if (!p || !p.id) continue; pageByName[String(p.name||'').toLowerCase()] = p; const iba = p.instagram_business_account; if (iba && iba.username) igByUser[String(iba.username).toLowerCase()] = { igUserId: iba.id, token: p.access_token }; }
function destFor(label){ const l = String(label||'').toLowerCase(); if (l.indexOf('world')>-1) return {igUser:'goocampusworld', fbPages:['goocampus world']}; if (l.indexOf('india')>-1 || l.indexOf('12')>-1) return {igUser:'12thplusdotcom', fbPages:['12thplus.com']}; return {igUser:'goocampus', fbPages:['goocampus edu','goocampus.in']}; }
const GRAPH = 'https://graph.facebook.com/v23.0';
const H = this.helpers;
const call = async (method, url) => H.httpRequest({ method: method, url: url, json: true });
const isVid = (u) => { const s = String(u||'').toLowerCase(); return s.indexOf('.mp4')>-1 || s.indexOf('.mov')>-1 || s.indexOf('.webm')>-1; };
const E = encodeURIComponent;
const fingerprint = (r) => { const c = r.custom || {}; const a = [r.media_urls || [], r.caption || '', c.caption_fb || '', c.cover_url || '', r.collaborators || [], c.publish_format || 'reel', c.channels || [], r.publish_to_pages || []]; if (Array.isArray(c.media_fb) && c.media_fb.length) a.push(c.media_fb); return JSON.stringify(a); };
let runStart = Date.now();
try { const ts = $('Every Minute').first().json.timestamp; if (ts) runStart = new Date(ts).getTime(); } catch (e) {}

const results = [];
for (const it of $input.all()) {
  const r = it.json;
  if (Date.now() - runStart > 40000) break;
  const c = r.custom || {};
  const fp = fingerprint(r);
  // Keep what an earlier run already sent, as long as it is for this exact post and
  // not older than 20 h (an Instagram container expires after 24 h).
  const old = c.prep;
  const fresh = old && old.fp === fp && old.at && (Date.now() - new Date(old.at).getTime()) < 20 * 3600000;
  const p = fresh ? JSON.parse(JSON.stringify(old)) : { fp: fp, at: new Date().toISOString() };
  delete p.error;
  try {
    const media = Array.isArray(r.media_urls) ? r.media_urls.filter(Boolean) : [];
    if (!media.length) throw new Error('no media uploaded');
    const dest = destFor((Array.isArray(r.publish_to_pages) && r.publish_to_pages[0]) || 'GooCampus Main');
    const caption = String(r.caption || '');
    const fmt = c.publish_format || 'reel';
    const wantReel = fmt === 'reel', wantStory = fmt === 'story';
    const ch = (Array.isArray(c.channels) && c.channels.length) ? c.channels : ['instagram','facebook'];
    const wantIg = ch.indexOf('instagram') > -1, wantFb = ch.indexOf('facebook') > -1;
    const fbMedia = (Array.isArray(c.media_fb) && c.media_fb.filter(Boolean).length) ? c.media_fb.filter(Boolean) : media;
    const multiFb = fbMedia !== media && fbMedia.length > 1 && !wantStory && !fbMedia.some(isVid);
    const collabList = (Array.isArray(r.collaborators) ? r.collaborators : []).map(function (x) { return String(x || '').trim().replace(/^@+/, ''); }).filter(Boolean).slice(0, 3);
    const collabParam = (collabList.length && !wantStory) ? ('&collaborators=' + E(JSON.stringify(collabList))) : '';

    // ── Instagram ──
    const igAcc = (wantIg && !c.ig_url_done) ? igByUser[dest.igUser] : null;
    if (igAcc) {
      const ig = igAcc.igUserId, tok = igAcc.token;
      if (!p.ig) {
        if (media.length > 1) {
          const kids = [];
          for (const m of media) { const v = isVid(m); const part = v ? ('media_type=VIDEO&video_url=' + E(m)) : ('image_url=' + E(m)); const k = await call('POST', GRAPH + '/' + ig + '/media?is_carousel_item=true&' + part + '&access_token=' + tok); kids.push(k.id); }
          p.ig = { kind: 'carousel', kids: kids, id: null, ready: false };
        } else if (wantStory) {
          const part = isVid(media[0]) ? ('video_url=' + E(media[0])) : ('image_url=' + E(media[0]));
          const k = await call('POST', GRAPH + '/' + ig + '/media?media_type=STORIES&' + part + '&access_token=' + tok);
          p.ig = { kind: 'story', id: k.id, ready: false };
        } else if (isVid(media[0]) && wantReel) {
          const cov = c.cover_url ? ('&cover_url=' + E(String(c.cover_url))) : '';
          const k = await call('POST', GRAPH + '/' + ig + '/media?media_type=REELS&video_url=' + E(media[0]) + '&caption=' + E(caption) + cov + collabParam + '&access_token=' + tok);
          p.ig = { kind: 'reel', id: k.id, ready: false };
        } else {
          const k = await call('POST', GRAPH + '/' + ig + '/media?image_url=' + E(media[0]) + '&caption=' + E(caption) + collabParam + '&access_token=' + tok);
          p.ig = { kind: 'image', id: k.id, ready: false };
        }
      }
      if (p.ig.kind === 'carousel' && !p.ig.id) {
        // Every slide has to finish before the carousel itself can be made.
        let all = true;
        for (const k of p.ig.kids) { const s = await call('GET', GRAPH + '/' + k + '?fields=status_code&access_token=' + tok); if (s.status_code === 'ERROR') throw new Error('Instagram could not process one of the carousel slides'); if (s.status_code !== 'FINISHED') all = false; }
        if (all) { const car = await call('POST', GRAPH + '/' + ig + '/media?media_type=CAROUSEL&caption=' + E(caption) + '&children=' + p.ig.kids.join(',') + collabParam + '&access_token=' + tok); p.ig.id = car.id; }
      }
      if (p.ig.id && !p.ig.ready) {
        const s = await call('GET', GRAPH + '/' + p.ig.id + '?fields=status_code&access_token=' + tok);
        if (s.status_code === 'ERROR') throw new Error('Instagram could not process the ' + (p.ig.kind === 'image' ? 'image' : 'video') + ' — usually the file is over 300 MB, 4K or landscape');
        if (s.status_code === 'FINISHED') { p.ig.ready = true; p.ig.readyAt = new Date().toISOString(); }
      }
    }

    // ── Facebook ── upload now, post at the time. A plain (non-reel) Page video has
    // no separate "post" step, so it is left to go out at the time as before.
    if (wantFb) {
      p.fb = p.fb || {};
      for (const pn of dest.fbPages) {
        if (p.fb[pn] || (c.fb_done && c.fb_done[pn])) continue;
        const pg = pageByName[pn]; if (!pg) continue; const ptok = pg.access_token;
        if (multiFb) {
          // Every picture goes up unpublished now; the post at the time attaches them all.
          const ids = [];
          for (const m of fbMedia) { const ph = await call('POST', GRAPH + '/' + pg.id + '/photos?url=' + E(m) + '&published=false&access_token=' + ptok); if (ph && ph.id) ids.push(ph.id); }
          if (ids.length === fbMedia.length) p.fb[pn] = { photos: ids };
          continue;
        }
        if (isVid(fbMedia[0]) && (wantReel || wantStory)) {
          const edge = wantStory ? 'video_stories' : 'video_reels';
          const st = await call('POST', GRAPH + '/' + pg.id + '/' + edge + '?upload_phase=start&access_token=' + ptok);
          const vid = st && st.video_id; if (!vid) throw new Error('facebook: no video_id from start');
          const upUrl = (st.upload_url && String(st.upload_url).indexOf('/v') > -1) ? st.upload_url : ('https://rupload.facebook.com/video-upload/v23.0/' + vid);
          await H.httpRequest({ method: 'POST', url: upUrl, headers: { Authorization: 'OAuth ' + ptok, file_url: fbMedia[0] }, json: true });
          const entry = { vid: vid, cover: false };
          if (wantReel && c.cover_url) {
            try {
              const img = await H.httpRequest({ method: 'GET', url: String(c.cover_url), encoding: 'arraybuffer', json: false });
              const bnd = '----n8nreelcover' + Math.random().toString(36).slice(2);
              const head = Buffer.from('--' + bnd + '\r\nContent-Disposition: form-data; name="is_preferred"\r\n\r\ntrue\r\n' + '--' + bnd + '\r\nContent-Disposition: form-data; name="source"; filename="cover.jpg"\r\n' + 'Content-Type: image/jpeg\r\n\r\n');
              const body = Buffer.concat([head, Buffer.from(img), Buffer.from('\r\n--' + bnd + '--\r\n')]);
              await H.httpRequest({ method: 'POST', url: GRAPH + '/' + vid + '/thumbnails?access_token=' + ptok, headers: { 'content-type': 'multipart/form-data; boundary=' + bnd }, body: body, json: false });
              entry.cover = true;
            } catch (e) { /* the publish step tries the cover again */ }
          }
          p.fb[pn] = entry;
        } else if (!isVid(fbMedia[0])) {
          // Photo post or photo story: the photo goes up unpublished now.
          const ph = await call('POST', GRAPH + '/' + pg.id + '/photos?url=' + E(fbMedia[0]) + '&published=false&access_token=' + ptok);
          if (ph && ph.id) p.fb[pn] = { photo: ph.id };
        }
      }
    }
  } catch (e) {
    p.error = String((e && e.message) || e).slice(0, 300);
  }
  results.push({ json: { p_id: r.id, p_prep: p } });
}
return results;
