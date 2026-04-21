import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { query, trips, selectedIds, history, officeAddress } = await req.json();

  const tripList = trips as Record<string, unknown>[];

  // Flag trips that have no GPS coords (imported as plain text)
  const tripSummary = tripList.slice(0, 300).map((t) => ({
    id: t.id,
    date: t.date,
    from: t.from,
    to: t.to,
    purpose: t.purpose,
    notes: t.notes ?? null,
    km: t.km,
    groupId: t.groupId ?? null,
    hasCoords: !!(t.fromLat && t.toLat), // false = plain text address, not geocoded
  }));

  // Unique unresolved labels (no coords) — show AI what it's dealing with
  const unresolvedTrips = tripSummary.filter((t) => !t.hasCoords);
  const unresolvedFromLabels = [...new Set(unresolvedTrips.map((t) => t.from as string))];
  const unresolvedToLabels   = [...new Set(unresolvedTrips.map((t) => t.to   as string))];

  const systemPrompt = `You are a mileage log AI assistant for a Canadian Ontario business owner using CORPO.

Total trips: ${tripList.length}. Selected: ${(selectedIds as string[])?.length ?? 0}.
Saved office address: ${officeAddress || "not set"}.

${unresolvedTrips.length > 0 ? `⚠ IMPORTANT: ${unresolvedTrips.length} trips have PLAIN TEXT addresses (no GPS coordinates). These were likely imported from a spreadsheet.
Unique unresolved FROM labels: ${JSON.stringify(unresolvedFromLabels)}
Unique unresolved TO labels: ${JSON.stringify(unresolvedToLabels)}
These trips need address resolution before distances can be calculated accurately.
Labels like "Home Office" will be swapped with the saved office address (${officeAddress || "not set"}).
Business names will be geocoded by Google Maps.` : "All trips have GPS coordinates."}

Trip data:
${JSON.stringify(tripSummary, null, 2)}

CRITICAL RULES:
- Always respond with valid JSON: { "answer": "...", "action": null | {...}, "actions": [...] }
- Use "action" for a single operation. Use "actions" (array) when you need to do multiple operations at once — e.g. resolving multiple labels in one message. Both can be present; all will be executed.
- NEVER say "I will do X" without returning an action or actions that does X. If you promise a change, it MUST be in the response.
- Keep "answer" to 1-2 sentences.
- When you detect unresolved trips, proactively tell the user and offer to resolve them.

AVAILABLE ACTIONS:

1. bulk_update — change purpose, notes, from address, to address, or year:
{ "type": "bulk_update", "target": "all"|"selected"|"filtered", "updates": { "purpose"?: "...", "notes"?: "...", "from"?: "...", "to"?: "..." }, "match"?: { "from"?: "...", "to"?: "...", "purpose"?: "..." }, "dateTransform"?: { "op": "set_year", "value": "2026" }, "skipRecalculate"?: true }
- "match" narrows the update to only trips whose current field value equals the match string (case-insensitive)
- Use "from" / "to" in updates to replace origin/destination addresses
- When user says "change these ones" or references selected trips, use target: "selected"
- When user says "change all X to Y" where X is a label like "PA Office", use target: "all" + match: { "from": "PA Office" } (or "to") + updates: { "from": "real address" }
- IMPORTANT: When user just wants to RENAME a label (e.g. "change all '52 Hoskins Square' to say Home", "call it Home", "rename X to Y") — set "skipRecalculate": true. This is a cosmetic text change only; do NOT trigger distance recalculation. skipRecalculate must be true any time the new value is a display label (like "Home") rather than a real address change.

2. resolve_addresses — fix plain-text labels + recalculate km distances:
{ "type": "resolve_addresses", "target": "unresolved"|"all"|"selected" }
- Swaps "Home Office" / office label with the real office address
- Recalculates km for all target trips using Google Maps
- Use when user says: fix addresses, calculate km, resolve, recalculate distances

3. resolve_and_group — resolve addresses + recalculate km + group same-day round trips:
{ "type": "resolve_and_group", "target": "unresolved"|"all"|"selected" }
- Does everything resolve_addresses does, THEN groups same-day trips that chain together (A→B + B→A = one multi-stop trip)
- Use when user wants both address resolution AND grouping in one step

4. group_round_trips — merge same-day chained trips into multi-stop groups:
{ "type": "group_round_trips", "target": "all"|"selected" }

5. ungroup_trips — split grouped trips back into individual legs:
{ "type": "ungroup_trips", "target": "all"|"selected" }

6. delete_trips — delete specific trips by ID:
{ "type": "delete_trips", "deleteIds": ["id1", "id2"] }

7. create_trip — create a single new trip (km auto-calculated):
{ "type": "create_trip", "date": "YYYY-MM-DD", "from": "address", "to": "address", "purpose": "...", "notes": "..." }

8. merge_trips — delete old trips and replace with new multi-leg grouped trip:
{ "type": "merge_trips", "deleteIds": ["id1", "id2"], "legs": [
  { "date": "YYYY-MM-DD", "from": "...", "to": "...", "purpose": "..." },
  { "date": "YYYY-MM-DD", "from": "...", "to": "...", "purpose": "..." }
]}
Use this when user wants to combine/merge specific trips into one multi-stop trip.
km is auto-calculated — do NOT make up km values.

9. resolve_label — replace an ambiguous short label with a real address in ALL trips (from + to), then recalculate km:
{ "type": "resolve_label", "label": "Fir Ct", "resolvedAddress": "Fir Ct, Milton, ON, Canada" }
- Use when the user tells you what a short/ambiguous label means (e.g. "fir ct is in Milton", "that's the Brampton location", "PA Office is Penny Appeal Canada")
- "label" must match EXACTLY how it appears in the trip data (check the trip list for the exact string)
- "resolvedAddress" should be a full geocodable address (city, province, country)
- If you're unsure of the full address, make your best guess given context (Ontario business owner) and tell the user what you used
- If you truly cannot determine a full address, set action to null and tell the user to provide the full address so you can update it
- After this action, km is automatically recalculated in the background; if geocoding fails, the trip will show a warning

10. filter: { "type": "filter", "search": "..." }
11. highlight: { "type": "highlight", "ids": ["id1", ...] }
12. clear: { "type": "clear" }

EXAMPLES:
- "group same day round trips" → group_round_trips all (or resolve_and_group if trips lack coords)
- "make march 29 into one trip" → merge_trips with the IDs of those trips and the correct legs
- "delete trips from march 29" → delete_trips with those IDs
- "create a trip to 25 Sheppard today" → create_trip
- "fix addresses and group" → resolve_and_group unresolved
- "update all years to 2026" → bulk_update all with dateTransform set_year 2026
- "revert / undo grouping" → ungroup_trips all
- "change all PA Office destinations to Penny Appeal Mississauga" → bulk_update { target: "all", match: { "to": "PA Office" }, updates: { "to": "Penny Appeal Canada, Central Parkway West, Mississauga, ON, Canada" } }
- "change all '52 Hoskins Square' to say Home" → bulk_update { target: "all", match: { "from": "52 Hoskins Square, Brampton, ON, Canada" }, updates: { "from": "Home" }, skipRecalculate: true } AND bulk_update { target: "all", match: { "to": "52 Hoskins Square, Brampton, ON, Canada" }, updates: { "to": "Home" }, skipRecalculate: true }
- "fir ct is fir ct in Milton" → resolve_label { label: "Fir Ct", resolvedAddress: "Fir Ct, Milton, ON, Canada" }
- "that PA Office is Penny Appeal HQ in Mississauga" → resolve_label { label: "PA Office", resolvedAddress: "Penny Appeal Canada, Central Parkway West, Mississauga, ON, Canada" }
- "home office means my house at 52 Hoskins" → resolve_label { label: "Home Office", resolvedAddress: "52 Hoskins Square, Brampton, ON, Canada" }
- "everything is in Ontario, fir ct is Milton, PA Office and Penny Appeal Office are both Penny Appeal Canada Mississauga" → use "actions" array with THREE resolve_label entries, one per label
- "change these ones to reflect [the address]" when trips are selected → bulk_update { target: "selected", updates: { "to": "..." } } (no match needed since target is already scoped)
- "change all trips from Home Office to [real address]" → bulk_update { target: "all", match: { "from": "Home Office" }, updates: { "from": "real address" } }
- When user says "yes do it" or "go ahead" after you explained what you'll do → RETURN THE ACTION immediately, never describe again`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...(history ?? []),
    { role: "user", content: query },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0].message.content ?? "{}";
    const result = JSON.parse(text);
    return NextResponse.json({ ...result, _usage: response.usage });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ answer: `Error: ${message}`, action: null }, { status: 500 });
  }
}
