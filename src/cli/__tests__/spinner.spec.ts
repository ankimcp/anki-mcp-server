import { startSpinner } from "../spinner";

describe("startSpinner", () => {
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    writeSpy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
  });

  afterEach(() => {
    jest.useRealTimers();
    writeSpy.mockRestore();
  });

  it("writes a frame containing the message on each tick", () => {
    const stop = startSpinner("Loading");

    jest.advanceTimersByTime(80);
    jest.advanceTimersByTime(80);

    expect(writeSpy).toHaveBeenCalledTimes(2);
    for (const call of writeSpy.mock.calls) {
      expect(call[0]).toContain("Loading");
      expect(call[0]).toMatch(/^\r/); // carriage-returned in place
    }

    stop();
  });

  it("does not write before the interval fires", () => {
    const stop = startSpinner("Loading");
    expect(writeSpy).not.toHaveBeenCalled();
    stop();
  });

  it("cycles through frames over time", () => {
    const stop = startSpinner("Working");

    // Advance through more than one full frame cycle (10 frames)
    for (let i = 0; i < 12; i++) {
      jest.advanceTimersByTime(80);
    }

    expect(writeSpy.mock.calls.length).toBe(12);
    const firstFrame = writeSpy.mock.calls[0][0];
    const eleventhFrame = writeSpy.mock.calls[10][0];
    // Frame index wraps mod 10, so frame 11 (index 10) should equal frame 1 (index 0).
    expect(eleventhFrame).toBe(firstFrame);

    stop();
  });

  it("stop() clears the spinner line and stops further writes", () => {
    const stop = startSpinner("Loading");

    jest.advanceTimersByTime(80);
    expect(writeSpy).toHaveBeenCalledTimes(1);

    stop();

    // stop() writes a carriage return to clear the line.
    expect(writeSpy).toHaveBeenLastCalledWith("\r");

    // No further writes after stop.
    const callsAfterStop = writeSpy.mock.calls.length;
    jest.advanceTimersByTime(800);
    expect(writeSpy.mock.calls.length).toBe(callsAfterStop);
  });
});
