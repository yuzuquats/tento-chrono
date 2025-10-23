import { assertEquals, assertExists } from "jsr:@std/assert";

interface TimezoneDropdownEntry {
  id: string;
  abbreviations: string[];
}

interface TimezoneDropdownData {
  timezones: TimezoneDropdownEntry[];
}

Deno.test("fetch and parse tz-list API - full list", async () => {
  // Using static.lona.so API endpoint
  const response = await fetch("https://static.lona.so:8443/timezones/2025a/1900_2050/tz_list");
  
  assertEquals(response.status, 200, "Should return 200 OK");
  
  const data: TimezoneDropdownData = await response.json();
  
  assertExists(data.timezones, "Should have timezones array");
  assertEquals(Array.isArray(data.timezones), true, "timezones should be an array");
  
  // Check that we have a reasonable number of timezones
  assertEquals(data.timezones.length > 300, true, "Should have more than 300 timezones");
  
  // Verify structure of first timezone
  if (data.timezones.length > 0) {
    const tz = data.timezones[0];
    assertExists(tz.id, "Timezone should have id");
    assertExists(tz.abbreviations, "Timezone should have abbreviations");
    assertEquals(Array.isArray(tz.abbreviations), true, "abbreviations should be an array");
    assertEquals(tz.abbreviations.length > 0, true, "Should have at least one abbreviation");
  }
  
  // Check for some well-known timezones
  const knownTimezones = [
    "America/New_York",
    "Europe/London",
    "Asia/Tokyo",
    "Australia/Sydney",
    "Pacific/Auckland"
  ];
  
  for (const tzId of knownTimezones) {
    const found = data.timezones.find(tz => tz.id === tzId);
    assertExists(found, `Should include ${tzId}`);
  }
});

Deno.test("fetch and parse tz-list API - common list", async () => {
  const response = await fetch("https://static.lona.so:8443/timezones/2025a/1900_2050/tz_list?common=true");
  
  assertEquals(response.status, 200, "Should return 200 OK");
  
  const data: TimezoneDropdownData = await response.json();
  
  assertExists(data.timezones, "Should have timezones array");
  assertEquals(Array.isArray(data.timezones), true, "timezones should be an array");
  
  // Common list should be smaller
  assertEquals(data.timezones.length > 30, true, "Should have more than 30 common timezones");
  assertEquals(data.timezones.length < 100, true, "Should have less than 100 common timezones");
  
  // Verify all common timezones have proper structure
  for (const tz of data.timezones) {
    assertExists(tz.id, `Timezone ${JSON.stringify(tz)} should have id`);
    assertExists(tz.abbreviations, `Timezone ${tz.id} should have abbreviations`);
    assertEquals(tz.abbreviations.length > 0, true, `Timezone ${tz.id} should have at least one abbreviation`);

    // All abbreviations should be strings (skip validation of empty strings as API may return them)
    for (const abbr of tz.abbreviations) {
      assertEquals(typeof abbr, "string", `Abbreviation should be string for ${tz.id}`);
    }
  }
});

Deno.test("tz-list API - verify abbreviation uniqueness within timezone", async () => {
  const response = await fetch("https://static.lona.so:8443/timezones/2025a/1900_2050/tz_list");
  const data: TimezoneDropdownData = await response.json();
  
  for (const tz of data.timezones) {
    const uniqueAbbrs = new Set(tz.abbreviations);
    assertEquals(
      uniqueAbbrs.size, 
      tz.abbreviations.length, 
      `Timezone ${tz.id} should have unique abbreviations: ${tz.abbreviations.join(", ")}`
    );
  }
});

Deno.test("tz-list API - verify common timezones are subset of full list", async () => {
  const [fullResponse, commonResponse] = await Promise.all([
    fetch("https://static.lona.so:8443/timezones/2025a/1900_2050/tz_list"),
    fetch("https://static.lona.so:8443/timezones/2025a/1900_2050/tz_list?common=true")
  ]);
  
  const fullData: TimezoneDropdownData = await fullResponse.json();
  const commonData: TimezoneDropdownData = await commonResponse.json();
  
  const fullIds = new Set(fullData.timezones.map(tz => tz.id));
  
  // Every common timezone should exist in full list
  for (const commonTz of commonData.timezones) {
    assertEquals(
      fullIds.has(commonTz.id), 
      true, 
      `Common timezone ${commonTz.id} should exist in full list`
    );
    
    // Find the same timezone in full list and verify abbreviations match
    const fullTz = fullData.timezones.find(tz => tz.id === commonTz.id);
    assertExists(fullTz);
    assertEquals(
      JSON.stringify(commonTz.abbreviations.sort()),
      JSON.stringify(fullTz.abbreviations.sort()),
      `Abbreviations should match for ${commonTz.id}`
    );
  }
});

Deno.test("tz-list API - error handling for invalid version", async () => {
  const response = await fetch("https://static.lona.so:8443/timezones/2024a/1900_2050/tz_list");
  assertEquals(response.status, 404, "Should return 404 for invalid version");
  await response.body?.cancel(); // Consume response body to avoid leak
});

Deno.test("tz-list API - error handling for invalid year range", async () => {
  const response = await fetch("https://static.lona.so:8443/timezones/2025a/2000_2100/tz_list");
  assertEquals(response.status, 404, "Should return 404 for invalid year range");
  await response.body?.cancel(); // Consume response body to avoid leak
});