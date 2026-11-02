import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMeetingTime, meetingTitle, nearestMeeting, sortMeetings } from "./meetings";

test("formatMeetingTime: 24 horas a am/pm", () => {
  assert.equal(formatMeetingTime("13:00"), "1:00 pm");
  assert.equal(formatMeetingTime("19:30"), "7:30 pm");
  assert.equal(formatMeetingTime("12:00"), "12:00 pm");
  assert.equal(formatMeetingTime("00:15"), "12:15 am");
  assert.equal(formatMeetingTime("09:05"), "9:05 am");
  assert.equal(formatMeetingTime("raro"), "raro");
});

test("meetingTitle y orden", () => {
  assert.equal(meetingTitle({ time: "15:00", label: null }), "3:00 pm");
  assert.equal(meetingTitle({ time: "15:00", label: "Jóvenes" }), "3:00 pm · Jóvenes");
  assert.deepEqual(sortMeetings([{ time: "19:00" }, { time: "13:00" }, { time: "15:00" }]).map((m) => m.time), ["13:00", "15:00", "19:00"]);
});

test("nearestMeeting: la que está en curso, si no la próxima, si no la última", () => {
  const list = [{ time: "13:00" }, { time: "15:00" }, { time: "17:00" }, { time: "19:00" }];
  assert.equal(nearestMeeting(list, "13:40")?.time, "13:00");
  assert.equal(nearestMeeting(list, "15:00")?.time, "15:00");
  assert.equal(nearestMeeting(list, "16:30")?.time, "15:00", "hasta 2 horas después de empezar sigue siendo la actual");
  assert.equal(nearestMeeting(list, "17:10")?.time, "17:00");
  assert.equal(nearestMeeting(list, "11:00")?.time, "13:00", "antes de todas, la primera");
  assert.equal(nearestMeeting(list, "22:30")?.time, "19:00", "después de todas, la última");
  assert.equal(nearestMeeting([], "10:00"), null);
});
