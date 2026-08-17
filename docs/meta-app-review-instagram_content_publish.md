# META APP REVIEW — REQUEST ADVANCED ACCESS
# Permission: instagram_content_publish

═══════════════════════════════════════════════════════════════════
FIELD: How will this app use instagram_content_publish?
═══════════════════════════════════════════════════════════════════
Fury is an AI-powered social media planning and management platform for businesses. It lets marketers and business owners create up to a full month of Instagram content automatically and reliably.

The instagram_content_publish permission is used exclusively to publish content that the user themselves created and approved inside the app, directly to the Instagram professional accounts they connected. Fury uses this permission to publish all three formats supported by the Instagram API: Feed posts (single image), Reels (video), and Stories.

Every single publication is explicitly authorized by the user when they schedule or manually publish a post in the app's calendar. Fury never publishes anything without the explicit action of the account owner.

═══════════════════════════════════════════════════════════════════
FIELD: Policy analysis for instagram_content_publish and compliance
═══════════════════════════════════════════════════════════════════
We have reviewed and agree to comply with the instagram_content_publish usage policies, including:

1. Authenticity & consent: We only publish content that the Instagram account owner created, reviewed, and approved within the app. There is no unsanctioned automated publishing or third-party content.

2. Volume limits: Fury enforces Meta's limit of 100 publications per account per 24-hour period. The in-app calendar prevents scheduling beyond this limit and monitors usage via the content_publishing_limit endpoint.

3. No prohibited content: We do not publish duplicated content, spam, misleading content, deceptive advertising, or any content that violates Instagram and Meta's content policies.

4. PPA (Page Publishing Authorization): The authorization flow guides the user to complete the Page Publishing Authorization when the connected Facebook Page requires it, per the official documentation.

5. Transparency: Each post has a clear status (draft, scheduled, published/failed), and the user can review captions, hashtags, CTA, and image before publishing.

═══════════════════════════════════════════════════════════════════
FIELD: How does your application use this permission/feature (end-to-end flow)?
═══════════════════════════════════════════════════════════════════
Flow steps:

1. Account connection: The user signs in via Facebook Business Login and connects their Instagram professional account (linked to a Facebook Page). The app stores the Page Access Token and the instagram_user_id.

2. AI content generation: An admin creates a plan with the AI scheduler. Fury generates an image (via a diffusion model), caption, hashtags, and CTA for each day.

3. Review & scheduling: The user reviews each post in the visual calendar and decides whether to publish immediately or schedule it for a specific date/time.

4. Publishing:
   - The backend calls POST /media to create a container with image_url/video_url + caption (+ media_type = REELS/STORIES when applicable).
   - It checks the container's status.
   - It calls POST /media_publish with the creation_id to actually publish.

5. In-app confirmation: The post is marked as published in the calendar.

Technical details:
- Token: Page Access Token of the connected Instagram professional account.
- Host: graph.facebook.com (Instagram API with Facebook Login).
- Callback/Webhook: media_fb_insights / comments (if configured) to keep post data up to date.

═══════════════════════════════════════════════════════════════════
FIELD: Do you agree that you are in compliance with the permitted use?
═══════════════════════════════════════════════════════════════════
Yes. Fury fully complies with the permitted use policies of instagram_content_publish:

- Publishes only with explicit consent of the account owner.
- Enforces Meta's volume limits.
- Does not perform unsanctioned automated, spam, or misleading content.
- Guides the user on PPA when required.
- Publishes content to the user's own connected professional Instagram accounts.

═══════════════════════════════════════════════════════════════════
FIELD: Additional permissions (select in the same request)
═══════════════════════════════════════════════════════════════════
This submission also requires instagram_basic, which is used to read the instagram_user_id and metadata of the connected account, required to configure and publish with instagram_content_publish.

Select both scopes in the same App Review request:
- instagram_basic
- instagram_content_publish
