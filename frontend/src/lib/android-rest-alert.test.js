// The rest-over alert on a locked Galaxy (Z Flip 6 QA): the notification came up but the tone did
// not play, and the countdown never showed on the Flip's cover screen. Neither half can run here,
// so this reads the native sources and holds them to the fix.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const alert = read('../../android/app/src/main/java/ch/duartesantos/opengym/RestAlert.java')
const service = read('../../android/app/src/main/java/ch/duartesantos/opengym/RestTimerService.java')
const manifest = read('../../android/app/src/main/AndroidManifest.xml')
const widgetInfo = read('../../android/app/src/main/res/xml/rest_widget_info.xml')
const widgetSamsung = read('../../android/app/src/main/res/xml/rest_widget_samsung.xml')

describe('the rest-over alert on Android', () => {
  it('plays the tone before the countdown’s foreground service stops', () => {
    const fire = alert.slice(alert.indexOf('public static void fire('), alert.indexOf('private static Intent alarmIntent('))
    const play = fire.indexOf('if (play) playSound(ctx);')
    const stop = fire.lastIndexOf('stopCountdown(ctx);')
    expect(play).toBeGreaterThan(0)
    expect(stop).toBeGreaterThan(play)
  })

  it('takes short audio focus for the tone and hands it back', () => {
    expect(alert).toContain('AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK')
    expect(alert).toContain('abandonAudioFocusRequest(focus)')
  })

  it('gives the countdown a title and a text a cover screen can show', () => {
    const card = alert.slice(alert.indexOf('static Notification countdownNotification('), alert.indexOf('private static void fillClock('))
    expect(card).toMatch(/b\.setContentTitle\(/)
    expect(card).toContain('b.setContentText(clock);')
    expect(card).not.toMatch(/setSubText\(/)
    // The service passes the page's countdown title ("Rest", "Switch sides") through.
    expect(service).toContain('title = text(intent, "title", title);')
    expect(service).toMatch(/countdownNotification\(\s*this, left, totalMs, paused, title,/)
  })

  it('on Samsung, draws the countdown in the system template the cover screen can show', () => {
    const card = alert.slice(alert.indexOf('static Notification countdownNotification('), alert.indexOf('private static void fillClock('))
    expect(card).toContain('if (SAMSUNG) return samsungCountdown(')
    const samsung = card.slice(card.indexOf('private static Notification samsungCountdown('))
    expect(samsung).toContain('.setProgress(max, left, false)')
    expect(samsung).toContain('.setContentText(clock)')
    expect(samsung).not.toMatch(/setCustom(Big)?ContentView|DecoratedCustomViewStyle|setColorized/)
    for (const a of ['ACTION_PAUSE', 'ACTION_MINUS', 'ACTION_PLUS', 'ACTION_SKIP']) expect(samsung).toContain(a)
    expect(samsung).toContain('"android.requestPromotedOngoing"')
    // Android 16 / One UI 8: a Live Update (ProgressStyle) is what the Now Bar, and so the
    // cover screen, draws with a bar.
    expect(samsung).toContain('if (Build.VERSION.SDK_INT >= 36) liveUpdate(b, max, left, clock, accent);')
    expect(alert).toContain('"android.app.Notification$ProgressStyle"')
    expect(alert).toContain('"setShortCriticalText"')
  })

  it('paints the rest on a cover-screen widget, which shows the bar and buttons a notification cannot', () => {
    expect(manifest).toMatch(/android:name="\.RestWidget"[\s\S]*?android\.appwidget\.provider[\s\S]*?com\.samsung\.android\.appwidget\.provider[\s\S]*?<\/receiver>/)
    expect(widgetSamsung).toMatch(/<samsung-appwidget-provider display="sub_screen"/)
    expect(widgetInfo).toContain('android:widgetCategory="keyguard"')
    expect(service).toContain('RestWidget.show(this, left, totalMs, paused, title,')
    expect(service).toContain('RestWidget.clear(this);')
  })
})
