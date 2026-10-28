// PUBLISH — runs for posts whose time has come (already claimed as 'publishing').
// When PREPARE sent the creative ahead (custom.prep, same fingerprint), this only
// presses "post": Instagram media_publish on the ready container, Facebook finish /
// feed on the uploaded file. Otherwise it does everything itself, as v2 did.
const results = [];
const lp = $('Load Pages').all() || [];
let pages = [];
for (const it of lp) { if (it.json && Array.isArray(it.json.data)) pages = pages.concat(it.json.data); }
const pageByName = {}; const igByUser = {};
for (const p of pages) { if (!p || !p.id) continue; pageByName[String(p.name||'').toLowerCase()] = p; const iba = p.instagram_business_account; if (iba && iba.username) igByUser[String(iba.username).toLowerCase()] = { igUserId: iba.id, token: p.access_token }; }
function destFor(label){ const l = String(label||'').toLowerCase(); if (l.indexOf('world')>-1) return {igUser:'goocampusworld', fbPages:['goocampus world']}; if (l.indexOf('india')>-1 || l.indexOf('12')>-1) return {igUser:'12thplusdotcom', fbPages:['12thplus.com']}; return {igUser:'goocampus', fbPages:['goocampus edu','goocampus.in']}; }
const GRAPH = 'https://graph.facebook.com/v23.0';
const H = this.helpers;
const call = async (method, url) => H.httpRequest({ method: method, url: url, json: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isVid = (u) => { const s = String(u||'').toLowerCase(); return s.indexOf('.mp4')>-1 || s.indexOf('.mov')>-1 || s.indexOf('.webm')>-1; };
const E = encodeURIComponent;
const fingerprint = (r) => { const c = r.custom || {}; const a = [r.media_urls || [], r.caption || '', c.caption_fb || '', c.cover_url || '', r.collaborators || [], c.publish_format || 'reel', c.channels || [], r.publish_to_pages || []]; if (Array.isArray(c.media_fb) && c.media_fb.length) a.push(c.media_fb); return JSON.stringify(a); };
for (const it of $input.all()) {
  const r = it.json;
  const out = { rowId: r.id, ig_url: null, fb_url: null, failure: null, publishStatus: 'failed' };
  // The working copy of custom, kept outside the try: if anything throws after one
  // platform has gone out, what went out (ig_url_done, fb_done) must be written back,
  // or "Try again" posts it a second time.
  let custRef = null;
  try {
    const t = r.schedule_time ? new Date(r.schedule_time).getTime() : NaN;
    if (isNaN(t) || t > Date.now()) {
      // Only due rows are routed here; if one isn't, hand it straight back.
      out.publishStatus = 'scheduled'; out.customOut = r.custom || {};
      results.push({ json: out });
      continue;
    }
    const media = Array.isArray(r.media_urls) ? r.media_urls.filter(Boolean) : [];
    if (!media.length) { out.failure = 'no media uploaded'; results.push({ json: out }); continue; }
    const dest = destFor((Array.isArray(r.publish_to_pages) && r.publish_to_pages[0]) || 'GooCampus Main');
    const caption = String(r.caption || '');
    const fmt = (r.custom && r.custom.publish_format) || 'reel';
    const wantReel = fmt === 'reel';
    const wantStory = fmt === 'story';
    const notes = [];
    const cust = Object.assign({}, r.custom || {});
    custRef = cust;
    // What PREPARE sent ahead — used only if it is for exactly this post and had no error.
    const prep = cust.prep && cust.prep.fp === fingerprint(r) && !cust.prep.error ? cust.prep : null;
    delete cust.prep;
    const igPrep = prep && prep.ig && prep.ig.id ? prep.ig : null;
    const fbPrep = (prep && prep.fb) || {};
    if (igPrep && !cust.ig_creation_id && (igPrep.kind === 'reel' || igPrep.kind === 'story')) cust.ig_creation_id = igPrep.id;
    // Carousel slides sent ahead but not combined into the carousel yet — reuse them.
    if (prep && prep.ig && prep.ig.kind === 'carousel' && !prep.ig.id && Array.isArray(prep.ig.kids) && !cust.ig_kids) cust.ig_kids = prep.ig.kids;
    cust.attempts = (Number(cust.attempts) || 0) + 1;
    let waiting = false;
    const POLLS = 6;   // 6 x 5s = 30s per run; the run is every minute
    const ch = (r.custom && Array.isArray(r.custom.channels) && r.custom.channels.length) ? r.custom.channels : ['instagram','facebook'];
    const wantIg = ch.indexOf('instagram') > -1, wantFb = ch.indexOf('facebook') > -1;
    const fbCaption = (r.custom && r.custom.caption_fb) ? String(r.custom.caption_fb) : caption;
    // Facebook's own set (custom.media_fb, 28 Oct): the pictures when the Instagram set is
    // video slides, or a picture carousel, posted as ONE multi-photo post. Without it, as before.
    const fbMedia = (r.custom && Array.isArray(r.custom.media_fb) && r.custom.media_fb.filter(Boolean).length) ? r.custom.media_fb.filter(Boolean) : media;
    const multiFb = fbMedia !== media && fbMedia.length > 1 && !wantStory && !fbMedia.some(isVid);
    const collabList = (Array.isArray(r.collaborators) ? r.collaborators : [])
      .map(function (x) { return String(x || '').trim().replace(/^@+/, ''); })
      .filter(Boolean).slice(0, 3);
    const collabParam = (collabList.length && !wantStory) ? ('&collaborators=' + E(JSON.stringify(collabList))) : '';
    const igAcc = (wantIg && !cust.ig_url_done) ? igByUser[dest.igUser] : null;
    if (igAcc) {
      const ig = igAcc.igUserId, tok = igAcc.token; let creationId;
      const pollUntilReady = async (id, what) => {
        for (let i = 0; i < POLLS; i++) { const s = await call('GET', GRAPH + '/' + id + '?fields=status_code&access_token=' + tok); if (s.status_code === 'FINISHED') return true; if (s.status_code === 'ERROR') throw new Error('instagram rejected the ' + what + ' while processing it'); await sleep(5000); }
        return false;
      };
      if (media.length > 1) {
        if (cust.ig_creation_id && Array.isArray(cust.ig_kids)) {
          creationId = cust.ig_creation_id;
          if (!(await pollUntilReady(creationId, 'carousel'))) waiting = true;
        } else if (igPrep && igPrep.kind === 'carousel') {
          creationId = igPrep.id;
          if (!igPrep.ready && !(await pollUntilReady(creationId, 'carousel'))) waiting = true;
        } else {
          // Slides are made once and kept on the row; a slide still processing hands
          // the post back for the next minute's run instead of failing it.
          let kids = Array.isArray(cust.ig_kids) ? cust.ig_kids : null;
          if (!kids) {
            kids = [];
            for (const m of media) { const v = isVid(m); const mediaPart = v ? ('media_type=VIDEO&video_url=' + E(m)) : ('image_url=' + E(m)); const c = await call('POST', GRAPH + '/' + ig + '/media?is_carousel_item=true&' + mediaPart + '&access_token=' + tok); kids.push(c.id); }
            cust.ig_kids = kids;
          }
          for (const k of kids) { if (!(await pollUntilReady(k, 'carousel slide'))) { waiting = true; break; } }
          if (!waiting) {
            const car = await call('POST', GRAPH + '/' + ig + '/media?media_type=CAROUSEL&caption=' + E(caption) + '&children=' + kids.join(',') + collabParam + '&access_token=' + tok);
            creationId = car.id;
            if (!(await pollUntilReady(creationId, 'carousel'))) { cust.ig_creation_id = creationId; waiting = true; }
          }
        }
      } else if (wantStory) {
        if (cust.ig_creation_id) { creationId = cust.ig_creation_id; }
        else {
          const part = isVid(media[0]) ? ('video_url=' + E(media[0])) : ('image_url=' + E(media[0]));
          const c = await call('POST', GRAPH + '/' + ig + '/media?media_type=STORIES&' + part + '&access_token=' + tok);
          creationId = c.id; cust.ig_creation_id = creationId;
        }
        if (!(igPrep && igPrep.ready) && (isVid(media[0]) || igPrep) && !(await pollUntilReady(creationId, isVid(media[0]) ? 'story video' : 'story image'))) waiting = true;
      } else if (isVid(media[0]) && wantReel) {
        if (cust.ig_creation_id) { creationId = cust.ig_creation_id; }
        else {
          const cov = (r.custom && r.custom.cover_url) ? ('&cover_url=' + E(String(r.custom.cover_url))) : '';
          const c = await call('POST', GRAPH + '/' + ig + '/media?media_type=REELS&video_url=' + E(media[0]) + '&caption=' + E(caption) + cov + collabParam + '&access_token=' + tok);
          creationId = c.id; cust.ig_creation_id = creationId;
        }
        if (!(igPrep && igPrep.ready) && !(await pollUntilReady(creationId, 'video'))) waiting = true;
      } else {
        if (igPrep && igPrep.kind === 'image') {
          creationId = igPrep.id;
          // Sent ahead but not confirmed ready — wait for it here, as for a video.
          if (!igPrep.ready && !(await pollUntilReady(creationId, 'image'))) waiting = true;
        }
        else { const c = await call('POST', GRAPH + '/' + ig + '/media?image_url=' + E(media[0]) + '&caption=' + E(caption) + collabParam + '&access_token=' + tok); creationId = c.id; await sleep(3000); }
      }
      if (!waiting) {
        const pub = await call('POST', GRAPH + '/' + ig + '/media_publish?creation_id=' + creationId + '&access_token=' + tok);
        let perma = null;
        try { const perm = await call('GET', GRAPH + '/' + pub.id + '?fields=permalink&access_token=' + tok); perma = perm.permalink || null; } catch (e) {}
        out.ig_url = perma;
        cust.ig_media_id = pub.id;
        cust.ig_url_done = perma || 'published';
        delete cust.ig_creation_id;
        delete cust.ig_kids;
      }
    }
    if (cust.ig_url_done && cust.ig_url_done !== 'published') out.ig_url = cust.ig_url_done;
    const fbUrls = [];
    cust.fb_ids = cust.fb_ids || {}; cust.fb_done = cust.fb_done || {};
    for (const pn of ((wantFb && !waiting) ? dest.fbPages : [])) {
      if (cust.fb_done[pn]) { fbUrls.push(cust.fb_done[pn]); continue; }
      const pg = pageByName[pn]; if (!pg) continue; const ptok = pg.access_token;
      const fp = fbPrep[pn] || {};
      if (multiFb) {
        let ids = (Array.isArray(fp.photos) && fp.photos.length === fbMedia.length) ? fp.photos : null;
        if (!ids) { ids = []; for (const m of fbMedia) { const ph = await call('POST', GRAPH + '/' + pg.id + '/photos?url=' + E(m) + '&published=false&access_token=' + ptok); if (!ph || !ph.id) throw new Error('facebook: a picture did not upload'); ids.push(ph.id); } }
        const fd = await call('POST', GRAPH + '/' + pg.id + '/feed?message=' + E(fbCaption) + '&attached_media=' + E(JSON.stringify(ids.map(function (i) { return { media_fbid: i }; }))) + '&access_token=' + ptok);
        const pid = (fd && fd.id) || ''; if (pid) { const u = 'https://www.facebook.com/' + pid; cust.fb_done[pn] = u; fbUrls.push(u); }
        continue;
      }
      if (isVid(fbMedia[0]) && wantReel) {
        let vid = cust.fb_ids[pn] || fp.vid || null;
        if (!vid) {
          const st = await call('POST', GRAPH + '/' + pg.id + '/video_reels?upload_phase=start&access_token=' + ptok);
          vid = st && st.video_id; if (!vid) throw new Error('facebook reel: no video_id from start');
          const upUrl = (st.upload_url && String(st.upload_url).indexOf('/v') > -1) ? st.upload_url : ('https://rupload.facebook.com/video-upload/v23.0/' + vid);
          await H.httpRequest({ method: 'POST', url: upUrl, headers: { Authorization: 'OAuth ' + ptok, file_url: fbMedia[0] }, json: true });
        }
        cust.fb_ids[pn] = vid;
        if (r.custom && r.custom.cover_url && !(fp.vid === vid && fp.cover)) {
          try {
            const img = await H.httpRequest({ method: 'GET', url: String(r.custom.cover_url), encoding: 'arraybuffer', json: false });
            const bnd = '----n8nreelcover' + Math.random().toString(36).slice(2);
            const head = Buffer.from('--' + bnd + '\r\nContent-Disposition: form-data; name="is_preferred"\r\n\r\ntrue\r\n'
              + '--' + bnd + '\r\nContent-Disposition: form-data; name="source"; filename="cover.jpg"\r\n'
              + 'Content-Type: image/jpeg\r\n\r\n');
            const tail = Buffer.from('\r\n--' + bnd + '--\r\n');
            const body = Buffer.concat([head, Buffer.from(img), tail]);
            await H.httpRequest({ method: 'POST', url: GRAPH + '/' + vid + '/thumbnails?access_token=' + ptok,
              headers: { 'content-type': 'multipart/form-data; boundary=' + bnd }, body: body, json: false });
          } catch (e) { notes.push('facebook cover failed: ' + (e && e.message ? e.message : 'unknown')); }
        }
        await call('POST', GRAPH + '/' + pg.id + '/video_reels?upload_phase=finish&video_id=' + vid + '&video_state=PUBLISHED&description=' + E(fbCaption) + '&access_token=' + ptok);
        const reelUrl = 'https://www.facebook.com/reel/' + vid;
        cust.fb_done[pn] = reelUrl; delete cust.fb_ids[pn];
        fbUrls.push(reelUrl);
      }
      else if (wantStory) {
        if (isVid(fbMedia[0])) {
          let vid = cust.fb_ids[pn] || fp.vid || null;
          if (!vid) {
            const st = await call('POST', GRAPH + '/' + pg.id + '/video_stories?upload_phase=start&access_token=' + ptok);
            vid = st && st.video_id; if (!vid) throw new Error('facebook story: no video_id from start');
            const upUrl = (st.upload_url && String(st.upload_url).indexOf('/v') > -1) ? st.upload_url : ('https://rupload.facebook.com/video-upload/v23.0/' + vid);
            await H.httpRequest({ method: 'POST', url: upUrl, headers: { Authorization: 'OAuth ' + ptok, file_url: fbMedia[0] }, json: true });
          }
          cust.fb_ids[pn] = vid;
          const fin = await call('POST', GRAPH + '/' + pg.id + '/video_stories?upload_phase=finish&video_id=' + vid + '&access_token=' + ptok);
          const sUrl = (fin && fin.post_id) ? ('https://www.facebook.com/' + fin.post_id) : 'https://www.facebook.com/' + pg.id;
          cust.fb_done[pn] = sUrl; delete cust.fb_ids[pn];
          fbUrls.push(sUrl);
        } else {
          let pid = fp.photo || null;
          if (!pid) { const ph = await call('POST', GRAPH + '/' + pg.id + '/photos?url=' + E(fbMedia[0]) + '&published=false&access_token=' + ptok); pid = ph && ph.id; }
          if (!pid) throw new Error('facebook story: no photo id');
          const st = await call('POST', GRAPH + '/' + pg.id + '/photo_stories?photo_id=' + pid + '&access_token=' + ptok);
          const sUrl = (st && st.post_id) ? ('https://www.facebook.com/' + st.post_id) : 'https://www.facebook.com/' + pg.id;
          cust.fb_done[pn] = sUrl;
          fbUrls.push(sUrl);
        }
      }
      else if (isVid(fbMedia[0])) {
        const v = await call('POST', GRAPH + '/' + pg.id + '/videos?file_url=' + E(fbMedia[0]) + '&description=' + E(fbCaption) + '&access_token=' + ptok);
        if (v && v.id) { const u = 'https://www.facebook.com/' + v.id; cust.fb_done[pn] = u; fbUrls.push(u); }
      }
      else if (fp.photo) {
        // Uploaded unpublished ahead of time — posting it is one call.
        const fd = await call('POST', GRAPH + '/' + pg.id + '/feed?message=' + E(fbCaption) + '&attached_media=' + E(JSON.stringify([{ media_fbid: fp.photo }])) + '&access_token=' + ptok);
        const pid = (fd && fd.id) || ''; if (pid) { const u = 'https://www.facebook.com/' + pid; cust.fb_done[pn] = u; fbUrls.push(u); }
      }
      else {
        const ph = await call('POST', GRAPH + '/' + pg.id + '/photos?url=' + E(fbMedia[0]) + '&caption=' + E(fbCaption) + '&access_token=' + ptok);
        const pid = (ph && (ph.post_id || ph.id)) || ''; if (pid) { const u = 'https://www.facebook.com/' + pid; cust.fb_done[pn] = u; fbUrls.push(u); }
      }
    }
    if (fbUrls.length) out.fb_url = fbUrls.join(' , ');
    // Still processing a file that was sent ahead: keep the prepared upload for the
    // next run, or the carousel / Facebook files would be uploaded all over again.
    if (waiting && prep) cust.prep = prep;
    out.customOut = cust;
    if (waiting) {
      if (cust.attempts > 20) { out.failure = 'still processing at Meta after 20 minutes — gave up'; out.publishStatus = 'failed'; }
      else { out.publishStatus = 'scheduled'; out.failure = null; }
    }
    // ig_url_done is set the moment Instagram accepted it, even if its link couldn't be read.
    else if (out.ig_url || out.fb_url || cust.ig_url_done) out.publishStatus = 'published';
    else if (!out.failure) out.failure = 'no matching destination';
    if (out.publishStatus === 'published' && notes.length && !out.failure) out.failure = notes.join('; ');
  } catch (e) {
    out.failure = String((e && e.message) || e).slice(0, 400);
    // Never write the row back without its settings (format, channels, cover…).
    if (!out.customOut) out.customOut = custRef || r.custom || {};
  }
  results.push({ json: out });
}
return results;
