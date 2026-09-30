/**
 * The hero's scene carousel. Crossfades between scenes, auto-advancing unless
 * paused (by the button, hovering/focusing the picture, or a reduced-motion
 * preference). Each change reports the scene's example question so the
 * prompt's placeholder can follow along.
 */

type CarouselOptions = {
  scenes: HTMLButtonElement[]
  controls: HTMLElement
  prev: HTMLButtonElement
  next: HTMLButtonElement
  toggle: HTMLButtonElement
  hoverArea: HTMLElement
  intervalMs: number
  onChange: (question: string) => void
}

export const createCarousel = ({
  scenes,
  controls,
  prev,
  next,
  toggle,
  hoverArea,
  intervalMs,
  onChange,
}: CarouselOptions) => {
  let index = 0
  let timer: ReturnType<typeof setInterval> | undefined
  let userPaused = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  let hovering = false
  let enabled = true

  const show = (next: number) => {
    index = (next + scenes.length) % scenes.length
    scenes.forEach((scene, i) => {
      const active = i === index
      scene.classList.toggle("active", active)
      scene.tabIndex = active ? 0 : -1
      if (active) scene.removeAttribute("aria-hidden")
      else scene.setAttribute("aria-hidden", "true")
    })
    onChange(scenes[index].dataset.suggestion ?? "")
  }

  const sync = () => {
    clearInterval(timer)
    timer = undefined
    controls.classList.toggle("paused", userPaused)
    toggle.setAttribute("aria-label", userPaused ? "Spela bildspelet" : "Pausa bildspelet")
    if (enabled && !userPaused && !hovering && !document.hidden) {
      timer = setInterval(() => show(index + 1), intervalMs)
    }
  }

  prev.addEventListener("click", () => {
    show(index - 1)
    sync()
  })
  next.addEventListener("click", () => {
    show(index + 1)
    sync()
  })
  toggle.addEventListener("click", () => {
    userPaused = !userPaused
    sync()
  })

  // Hold still while someone is looking at (or tabbing through) the picture
  hoverArea.addEventListener("pointerenter", () => {
    hovering = true
    sync()
  })
  hoverArea.addEventListener("pointerleave", () => {
    hovering = false
    sync()
  })
  hoverArea.addEventListener("focusin", () => {
    hovering = true
    sync()
  })
  hoverArea.addEventListener("focusout", () => {
    hovering = false
    sync()
  })
  document.addEventListener("visibilitychange", sync)

  show(0)
  sync()

  return {
    current: () => scenes[index].dataset.suggestion ?? "",
    /** Stops auto-advancing while the carousel isn't on screen (chat mode). */
    setEnabled: (on: boolean) => {
      enabled = on
      sync()
    },
  }
}
