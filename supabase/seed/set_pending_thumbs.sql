-- ═══════════════════════════════════════════════════════════════
-- Give the two pending demo videos a frame.
--
-- Reuses the two Bold Buns frames already in /public/submission-thumbs/, so
-- the pending tiles show a real video still instead of the product image.
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

update public.submissions
   set thumbnail_url = case video_url
         when 'demo/placeholder-pending-1.mp4' then '/submission-thumbs/6.jpg'
         when 'demo/placeholder-pending-2.mp4' then '/submission-thumbs/3.jpg'
       end
 where video_url in ('demo/placeholder-pending-1.mp4', 'demo/placeholder-pending-2.mp4');

select video_url, status, thumbnail_url
  from public.submissions
 where video_url like 'demo/placeholder-pending-%'
 order by video_url;
