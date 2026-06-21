import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as util from 'util';

const execFileAsync = util.promisify(execFile);

export type ComputerUseResult = {
  ok: boolean;
  action: string;
  message?: string;
  data?: Record<string, unknown>;
  error?: string;
};

type ComputerUseParams = Record<string, unknown>;

export class ComputerUseManager {
  public async execute(args: ComputerUseParams): Promise<ComputerUseResult> {
    const action = String(args.action || '');
    const params = this.objectParam(args.params) ?? args;

    switch (action) {
      case 'permissions':
        return this.permissions();
      case 'screenshot':
        return this.screenshot();
      case 'click':
        return this.click(params);
      case 'type':
        return this.typeText(params);
      case 'keypress':
      case 'key':
        return this.keypress(params);
      case 'scroll':
        return this.scroll(params);
      default:
        return {
          ok: false,
          action: action || 'unknown',
          error: `Unsupported computer_use action: ${action || '(empty)'}`,
        };
    }
  }

  public async permissions(): Promise<ComputerUseResult> {
    if (process.platform !== 'darwin') {
      return {
        ok: false,
        action: 'permissions',
        error: 'Computer Use is currently implemented for macOS only.',
      };
    }

    let accessibility: 'granted' | 'denied' | 'unknown' = 'unknown';
    try {
      const { stdout } = await this.runOsascript([
        'tell application "System Events" to get UI elements enabled',
      ]);
      accessibility = stdout.trim() === 'true' ? 'granted' : 'denied';
    } catch {
      accessibility = 'unknown';
    }

    // Probe Screen Recording by attempting a quick silent capture
    let screenRecording: 'granted' | 'denied' | 'unknown' = 'unknown';
    try {
      const probePath = path.join(os.tmpdir(), `ai-agent-screen-probe-${Date.now()}.png`);
      await execFileAsync('/usr/sbin/screencapture', ['-x', probePath], {
        timeout: 3_000,
        maxBuffer: 256,
      });
      // If we got here, capture succeeded → permission granted
      screenRecording = 'granted';
      try { fs.unlinkSync(probePath); } catch { /* ignore */ }
    } catch (error) {
      const msg = this.errorMessage(error);
      if (msg.toLowerCase().includes('not allowed') || msg.toLowerCase().includes('denied')) {
        screenRecording = 'denied';
      } else {
        screenRecording = 'unknown';
      }
    }

    return {
      ok: true,
      action: 'permissions',
      data: {
        platform: 'darwin',
        screenRecording,
        accessibility,
        required: ['Screen Recording', 'Accessibility'],
      },
      message: this.describePermissions(accessibility, screenRecording),
    };
  }

  /**
   * Open macOS System Settings to the specified privacy pane.
   */
  public async openSettings(pane?: 'accessibility' | 'screenRecording'): Promise<ComputerUseResult> {
    if (process.platform !== 'darwin') {
      return {
        ok: false,
        action: 'openSettings',
        error: 'Only supported on macOS.',
      };
    }

    const urls: Record<string, string> = {
      accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
      screenRecording: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    };

    const url = pane ? urls[pane] : 'x-apple.systempreferences:com.apple.preference.security';

    try {
      await execFileAsync('/usr/bin/open', [url], { timeout: 5_000 });
      return {
        ok: true,
        action: 'openSettings',
        message: pane
          ? `已打开「${pane === 'accessibility' ? '辅助功能' : '屏幕录制'}」权限设置`
          : '已打开系统设置「隐私与安全性」',
      };
    } catch (error) {
      return {
        ok: false,
        action: 'openSettings',
        error: this.errorMessage(error),
      };
    }
  }

  public async screenshot(): Promise<ComputerUseResult> {
    if (process.platform !== 'darwin') {
      return this.unsupported('screenshot');
    }

    const outputPath = path.join(os.tmpdir(), `ai-agent-screen-${Date.now()}.png`);
    try {
      await execFileAsync('/usr/sbin/screencapture', ['-x', outputPath], {
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      });
      const imageBase64 = fs.readFileSync(outputPath).toString('base64');
      return {
        ok: true,
        action: 'screenshot',
        data: {
          mimeType: 'image/png',
          imageBase64,
          dataUrl: `data:image/png;base64,${imageBase64}`,
        },
      };
    } catch (error) {
      return {
        ok: false,
        action: 'screenshot',
        error: this.errorMessage(error),
      };
    } finally {
      try {
        fs.unlinkSync(outputPath);
      } catch {
        // ignore temp cleanup failures
      }
    }
  }

  public async click(params: ComputerUseParams): Promise<ComputerUseResult> {
    if (process.platform !== 'darwin') {
      return this.unsupported('click');
    }
    const x = this.numberParam(params.x);
    const y = this.numberParam(params.y);
    if (x == null || y == null) {
      return { ok: false, action: 'click', error: 'click requires numeric x and y params.' };
    }

    const button = String(params.button || 'left') === 'right' ? 'right' : 'left';
    const mouseButton = button === 'right' ? 'right' : 'left';
    const down = button === 'right' ? 'rightMouseDown' : 'leftMouseDown';
    const up = button === 'right' ? 'rightMouseUp' : 'leftMouseUp';

    const swift = `
import Cocoa
let x = Double(CommandLine.arguments[1])!
let y = Double(CommandLine.arguments[2])!
let point = CGPoint(x: x, y: y)
let down = CGEvent(mouseEventSource: nil, mouseType: .${down}, mouseCursorPosition: point, mouseButton: .${mouseButton})
let up = CGEvent(mouseEventSource: nil, mouseType: .${up}, mouseCursorPosition: point, mouseButton: .${mouseButton})
down?.post(tap: .cghidEventTap)
up?.post(tap: .cghidEventTap)
`;

    return this.runSwiftAction('click', swift, [String(x), String(y)]);
  }

  public async typeText(params: ComputerUseParams): Promise<ComputerUseResult> {
    if (process.platform !== 'darwin') {
      return this.unsupported('type');
    }
    const text = String(params.text ?? '');
    if (!text) {
      return { ok: false, action: 'type', error: 'type requires a text param.' };
    }

    try {
      await this.runOsascript([
        `tell application "System Events" to keystroke "${this.escapeAppleScriptString(text)}"`,
      ]);
      return { ok: true, action: 'type', message: `Typed ${text.length} character(s).` };
    } catch (error) {
      return { ok: false, action: 'type', error: this.errorMessage(error) };
    }
  }

  public async keypress(params: ComputerUseParams): Promise<ComputerUseResult> {
    if (process.platform !== 'darwin') {
      return this.unsupported('keypress');
    }

    const key = String(params.key || '').toLowerCase();
    const keyCode = this.keyCode(key);
    if (keyCode == null) {
      return { ok: false, action: 'keypress', error: `Unsupported key: ${key || '(empty)'}` };
    }

    const modifiers = Array.isArray(params.modifiers)
      ? params.modifiers.map(String)
      : [];
    const using = this.appleScriptModifiers(modifiers);
    try {
      await this.runOsascript([
        `tell application "System Events" to key code ${keyCode}${using}`,
      ]);
      return { ok: true, action: 'keypress', message: `Pressed ${key}.` };
    } catch (error) {
      return { ok: false, action: 'keypress', error: this.errorMessage(error) };
    }
  }

  public async scroll(params: ComputerUseParams): Promise<ComputerUseResult> {
    if (process.platform !== 'darwin') {
      return this.unsupported('scroll');
    }
    const dx = Math.trunc(this.numberParam(params.dx) ?? 0);
    const dy = Math.trunc(this.numberParam(params.dy) ?? 0);
    if (dx === 0 && dy === 0) {
      return { ok: false, action: 'scroll', error: 'scroll requires dx or dy.' };
    }

    const swift = `
import Cocoa
let dx = Int32(CommandLine.arguments[1])!
let dy = Int32(CommandLine.arguments[2])!
let event = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2, wheel1: dy, wheel2: dx, wheel3: 0)
event?.post(tap: .cghidEventTap)
`;

    return this.runSwiftAction('scroll', swift, [String(dx), String(dy)]);
  }

  private async runSwiftAction(
    action: string,
    source: string,
    args: string[],
  ): Promise<ComputerUseResult> {
    try {
      await this.runSwift(source, args);
      return { ok: true, action };
    } catch (error) {
      return { ok: false, action, error: this.errorMessage(error) };
    }
  }

  private async runSwift(source: string, args: string[]): Promise<void> {
    const scriptPath = path.join(os.tmpdir(), `ai-agent-cu-${Date.now()}.swift`);
    fs.writeFileSync(scriptPath, source, 'utf8');
    try {
      await execFileAsync('/usr/bin/swift', [scriptPath, ...args], {
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      });
    } finally {
      try {
        fs.unlinkSync(scriptPath);
      } catch {
        // ignore temp cleanup failures
      }
    }
  }

  private runOsascript(lines: string[]) {
    const args = lines.flatMap(line => ['-e', line]);
    return execFileAsync('/usr/bin/osascript', args, {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
  }

  private objectParam(value: unknown): ComputerUseParams | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as ComputerUseParams;
    }
    return null;
  }

  private numberParam(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return null;
  }

  private appleScriptModifiers(modifiers: string[]): string {
    const allowed = new Map([
      ['command', 'command down'],
      ['cmd', 'command down'],
      ['control', 'control down'],
      ['ctrl', 'control down'],
      ['option', 'option down'],
      ['alt', 'option down'],
      ['shift', 'shift down'],
    ]);
    const mapped = modifiers
      .map(mod => allowed.get(mod.toLowerCase()))
      .filter((mod): mod is string => Boolean(mod));
    return mapped.length > 0 ? ` using {${mapped.join(', ')}}` : '';
  }

  private keyCode(key: string): number | null {
    const map: Record<string, number> = {
      enter: 36,
      return: 36,
      tab: 48,
      space: 49,
      escape: 53,
      esc: 53,
      delete: 51,
      backspace: 51,
      up: 126,
      down: 125,
      left: 123,
      right: 124,
      home: 115,
      end: 119,
      pageup: 116,
      pagedown: 121,
      a: 0,
      s: 1,
      d: 2,
      f: 3,
      h: 4,
      g: 5,
      z: 6,
      x: 7,
      c: 8,
      v: 9,
      b: 11,
      q: 12,
      w: 13,
      e: 14,
      r: 15,
      y: 16,
      t: 17,
      '1': 18,
      '2': 19,
      '3': 20,
      '4': 21,
      '6': 22,
      '5': 23,
      '=': 24,
      '9': 25,
      '7': 26,
      '-': 27,
      '8': 28,
      '0': 29,
      ']': 30,
      o: 31,
      u: 32,
      '[': 33,
      i: 34,
      p: 35,
      l: 37,
      j: 38,
      "'": 39,
      k: 40,
      ';': 41,
      '\\': 42,
      ',': 43,
      '/': 44,
      n: 45,
      m: 46,
      '.': 47,
      '`': 50,
    };
    if (map[key] != null) return map[key];
    return null;
  }

  private escapeAppleScriptString(input: string): string {
    return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private unsupported(action: string): ComputerUseResult {
    return {
      ok: false,
      action,
      error: 'Computer Use is currently implemented for macOS only.',
    };
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  private describePermissions(
    accessibility: string,
    screenRecording: string,
  ): string {
    const missing: string[] = [];
    if (accessibility === 'denied' || accessibility === 'unknown') missing.push('辅助功能 (Accessibility)');
    if (screenRecording === 'denied' || screenRecording === 'unknown') missing.push('屏幕录制 (Screen Recording)');
    if (missing.length === 0) return '所有必要权限已授予';
    return `缺失权限: ${missing.join('、')}。请在「系统设置 → 隐私与安全性」中授予。`;
  }
}
