# SQL runbook

All of these run in the **Supabase SQL editor**. Paste the whole file, hit Run,
check the result against "you should see" before moving on.

**Push and let Vercel finish first.** Several of these write image paths served
from your own domain. If the deploy hasn't landed the database is correct but
the browser shows nothing, which looks exactly like failed SQL.

Every file is safe to run twice. Lost your place? Run
`supabase/diagnose.sql` — it reports which steps have run.

---

## Already done

1. `migrations/0014_products_and_chat.sql` — products, content direction, chat
2. `seed/set_demo_covers.sql` — campaign cover images
3. `seed/seed_products.sql` — content direction and product listings
4. `seed/set_brand_logos.sql` — brand logos
5. `seed/set_submission_thumbs.sql` — video frames on the six submissions
6. `migrations/0015_brand_setup.sql` — brand setup columns

---

## To run now, in this order

### 7. `seed/adopt_bold_buns.sql`

Makes the brand test account **be** Bold Buns. Moves every campaign,
submission, order and earning off the seeded demo brand onto the brand row
your account already owns, then deletes the emptied demo row.

Why moving rather than just reassigning: `getMyBrand()` takes the *oldest*
brand a user owns, and the auto-provisioned one predates the seed. Setting
`owner_user_id` on the demo row would have changed nothing visible.

It deliberately leaves `brand_connections` alone, so Shopify and Meta stay
unconnected and the live connect demo still works.

**You should see:** one row — Bold Buns, handle `bold-buns`, `setup_complete`
true, with 1 campaign, 2 submissions, and a non-zero order and earning count.

### 8. `seed/seed_chat.sql`

A real conversation between the brand and creator test accounts: four messages
in the Bold Buns campaign room, three in a private thread about the video the
brand passed on.

⚠ This **disables the `messages_stamp_sender` trigger** for the length of the
insert, then turns it back on in the same transaction. That trigger is what
stops a client posting as someone else — the SQL editor has no `auth.uid()`,
so seeded messages can't be stamped. The last query in the file proves the
trigger is back on.

**You should see:** two result tables. First: `campaign 4`, `submission 3`.
Second: the trigger with verdict **"ON — senders are stamped from the
session"**. If that second one says OFF, stop and tell me.

---

## Then check it in the app

**As the brand**

- Dashboard shows the revenue chart with the 7/30/90 selector, and no KYRO fee
- Submissions has videos to review
- Creators shows the roster
- Chat has the campaign room and the private thread
- Finance is the only place the 1% appears

**As the creator**

- The same two conversations, from the other side
- Reply on a card opens the private thread

**Both**

- Send a message from one account, confirm it arrives on the other with the
  right sender name and a BRAND tag where it should be. That exercises the
  trigger, which is the part worth proving before Monday rather than on Monday.
