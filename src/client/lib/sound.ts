import { useSyncExternalStore } from 'react'
import { load, save } from './storage'

const KEY = 'hex:sound'
let enabled = load<boolean>(KEY, false)
let audio: AudioContext | null = null
const listeners = new Set<() => void>()

export function setSoundEnabled(value: boolean): void {
  enabled = value
  save(KEY, value)
  listeners.forEach(listener => listener())
  if (value) playStone()
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => enabled
  )
}

function tone(notes: number[], gain: number, duration: number, spacing: number): void {
  if (!enabled) return
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
    notes.forEach((frequency, index) => {
      const start = audio!.currentTime + index * spacing
      const oscillator = audio!.createOscillator()
      const volume = audio!.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      volume.gain.setValueAtTime(0, start)
      volume.gain.linearRampToValueAtTime(gain, start + 0.006)
      volume.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      oscillator.connect(volume).connect(audio!.destination)
      oscillator.start(start)
      oscillator.stop(start + duration)
    })
  } catch {
    // No audio available.
  }
}

/** A soft wooden "tock" for a stone. */
export const playStone = () => tone([520], 0.08, 0.09, 0)
/** A short rising chord for a win. */
export const playWin = () => tone([523, 659, 784], 0.07, 0.35, 0.09)
