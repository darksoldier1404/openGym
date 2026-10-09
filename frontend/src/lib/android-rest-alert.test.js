// The rest-over alert on a locked Galaxy (Z Flip 6 QA): the notification came up but the tone did
// not play, and the countdown never showed on the Flip's cover screen. Neither half can run here,
// so this reads the native sources and holds them to the fix.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const alert = read('../../android/app/src/main/java/ch/duartesantos/opengym/RestAlert.java')
const service = read('../../android/app/src/main/java/ch/duartesantos/opengym/RestTimerService.java')

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
})
