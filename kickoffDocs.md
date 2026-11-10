KickOff Mobile App Project Proposal
I. Project Title & Overview
App Name: KickOff
Tagline: Your digital ticket to match day.
Problem Statement
Managing tickets and updates for a football club is often slow and disorganized. Fans have to wait in long cash lines for paper tickets, cannot pick their exact seating zone or seat number, and easily lose paper tickets. They also have to check different places just to see match schedules, news, or buy club gear. At the same time, club admins lack a single web system to manage seating, publish news, and scan tickets at the gate.
Target Audience
Primary Users — Football Club Supporters (Fans & Students):
Local fans, university students, and club members who want to purchase match tickets online, store digital passes on their mobile devices, and receive match updates.
Secondary Users — Football Club Admins & Event Staff:
Club managers and gate staff who need an administrative interface to list upcoming matches, manage ticket inventory, and scan or validate digital QR tickets at stadium entry points.

II. Core Features & Scope
1. Minimum Viable Product (MVP)
Customer Mobile App (React Native):
User Authentication: Account registration, login, logout, and customer profile management.
Club Information & News: Home feed displaying upcoming match fixtures, past match results, and official team news.
Ticketing System: Browse upcoming matches, select a seating zone, choose an exact seat number within that zone, and view real-time seat availability.
Payment Integration: Secure checkout for tickets using Stripe API (test mode).
Digital Ticket Generation: Generate and display a digital pass with match details, user info, seat selection, and a unique QR code for stadium entry.
Order History & Receipt Downloads: PDF receipts for match tickets.
Admin Web Dashboard:
Admin Authentication: Secure login for authorized club staff.
Match & Ticket Management: Create upcoming fixtures, configure stadium seating zones/seats, and set ticket prices.
News & Content Control: Publish and manage team news and match results.
Gate Validation: Scan or input ticket QR codes to verify authenticity and mark tickets as "used" at the entrance.

2. User Flow
Customer Flow
Register/Login ➔ View Upcoming Match ➔ Select Zone & Seat Number ➔ Stripe Payment ➔ Receive Digital QR Ticket ➔ Scan at Stadium Gate
Admin Flow
Admin Login ➔ Create Match Fixture ➔ Configure Seating & Prices ➔ Scan Customer QR Ticket
3. Nice-to-Have Features (Post-MVP / Future Scope)
Push Notifications: Automated alerts for kickoff reminders, goal updates, or news releases.
Interactive Seat Map: Visual canvas/graphic map where users tap physical seat dots instead of choosing from grid lists.
Merchandise Shop: Browse official club items, view item details, and add items to a basic shopping cart.
Fan Chat / Social Feed: A discussion board for supporters to interact before match days.

III. Project Limitations & Constraints
1. Project Limitations (Scope Constraints)
Single-Team Scope: The system is built for a single football club and does not support multi-club multi-tenancy or league-wide scheduling.
Simplified Payment Flow: Payment processing uses Stripe in test mode with mock payment credentials rather than processing real live financial transactions.
Basic Seat Allocation: Seating selection is limited to pre-configured zones and grid layouts rather than an interactive 3D stadium map.
No Season Tickets: Tickets can only be purchased for individual, single-match fixtures; bulk or full-season passes are not supported in this version.
No Membership System: The app does not include tiered fan memberships, loyalty rewards, or subscriber-only discounts.
Simulated QR Entry: Ticket QR verification is tested via mobile camera or admin web input without integrating specialized turnstile hardware.

2. Technical Constraints
Database & Server Hosting: The backend API and database operate under standard free-tier hosting resources, limiting concurrent high-traffic load handling.
Project Timeline: System features, database schema design, and testing must be completed within the academic semester timeframe
Network & Offline Handling: The customer mobile application requires an active internet connection to process Stripe payments and fetch live match news, with local storage used only to cache already-issued QR digital tickets for offline entrance verification.



