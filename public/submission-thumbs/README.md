# Submission thumbnails

Stand-in frames for the six demo submissions, so the creator dashboard shows
something that reads as video rather than a generated colour tile.

Temporary. KYRO does not extract a frame from an uploaded video yet, so
`submissions.thumbnail_url` is null for anything really uploaded and the card
falls back to the campaign's product image, then to the generated tile. When
frame extraction lands, this folder goes away.

## Adding them

Drop six 9:16 images in here named `1.jpg` through `6.jpg`, then run
`supabase/seed/set_submission_thumbs.sql`.

- **Portrait, 9:16.** They render in a 9:16 frame with `object-cover`, so a
  landscape image gets its sides cropped off.
- **720×1280 is plenty.** Bigger just makes the repo heavier.
- Order matters only loosely: 1 through 3 land on the "in use" videos, 4
  through 6 on the "not used" ones.

## Before you use someone else's frame

These get committed to the repo and deployed to itskyro.com, which is public.
A screenshot of another creator's video is their footage and, usually, their
face — shown inside KYRO as if it were work submitted to one of these
campaigns.

Use frames from content you or Aragon Media own, content a creator has given
you permission to use as a sample, or licensed stock. Anything else is
someone's likeness in a product demo without their say-so, and it is the kind
of thing a white-label partner's legal review will find.
