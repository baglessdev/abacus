"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef, type RefObject } from "react"

type RouteFocusProps = {
  mainRef: RefObject<HTMLElement | null>
}

export function RouteFocus({ mainRef }: RouteFocusProps) {
  const pathname = usePathname()
  const isFirstMount = useRef(true)

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }
    mainRef.current?.focus()
  }, [pathname, mainRef])

  return null
}
