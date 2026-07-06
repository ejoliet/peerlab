# peerlab

P2P “deploy” + live user-testing lab, zero backend

One file. Your browser tab is the server. You drag your MVP’s dist/ folder into the host tab, get a share link, and testers load your app through a WebRTC tunnel. While they use it, you watch their session live (DOM replay, console errors, rage-clicks) streamed back to you.

It kills three tools at once for MVP testing:

	•	ngrok / Vercel preview deploys (no deploy, no account, no DNS)
	•	Hotjar / PostHog session replay (no SDK signup, no data leaves the P2P mesh)
	•	“Hey can you screen-share while you try it” (built in)
