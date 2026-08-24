# K2K · Navneet walks India

This repository powers Navneet's public K2K project website.

## Project

**K2K** is a planned Kanyakumari-to-Kashmir walk beginning **1 December 2026**. The working distance is approximately **4,000 km**, with an expected duration of **4–6 months**.

The walk is designed as an endurance challenge and a long-form storytelling project. Planned documentation includes:

- 300+ short-form videos / reels
- YouTube and longer documentary-style videos
- Thousands of photographs
- Dozens of local conversations and interviews
- Regular written field notes and articles
- A final book about the journey

## Current preparation

Navneet is currently preparing in Lucknow, Uttar Pradesh. The public tracker therefore uses Lucknow as the preparation marker until the expedition starts.

## Website pages

- `index.html` — project homepage
- `about.html` — Navneet and the story behind K2K
- `route.html` — working route corridor and route-record table
- `expedition.html` — duration, daily life, gear, budget, documentation and safety planning
- `tracker.html` — India map, Kanyakumari-to-Kashmir route line, Lucknow marker and browser GPS mode
- `journal.html` — field-journal structure and future dispatches
- `sponsorship.html` — ₹2 lakh working sponsorship target, budget allocation and partnership enquiry form
- `styles.css` — shared visual system and responsive layout

## Tracker note

The public tracker currently displays Lucknow. The browser GPS mode can read the device's location after permission is granted and move the marker during that browser session.

A truly public remote tracker, where a phone publishes its live position and every visitor sees the same changing location, requires a location-publishing backend. That has intentionally not been faked with a static marker.

## Sponsorship

The current working target is **₹2,00,000**. The site uses a planning model of:

- ₹45,000 food
- ₹55,000 gear
- ₹20,000 safety
- ₹30,000 documentation
- ₹25,000 logistics
- ₹25,000 contingency

These are planning figures and can change after final quotations and route planning.

## Deployment

The site is static HTML/CSS/JavaScript and can be deployed directly from the `main` branch on Netlify. The sponsorship form uses Netlify Forms markup.
