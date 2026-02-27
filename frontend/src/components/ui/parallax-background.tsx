import { useEffect } from "react"
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion"

export function ParallaxBackground() {
    const prefersReducedMotion = useReducedMotion()
    const mouseX = useMotionValue(0)
    const mouseY = useMotionValue(0)

    useEffect(() => {
        if (prefersReducedMotion) {
            return
        }
        const handleMouseMove = (e: MouseEvent) => {
            mouseX.set(e.clientX / window.innerWidth - 0.5)
            mouseY.set(e.clientY / window.innerHeight - 0.5)
        }

        window.addEventListener("mousemove", handleMouseMove)
        return () => window.removeEventListener("mousemove", handleMouseMove)
    }, [mouseX, mouseY, prefersReducedMotion])

    const springConfig = { damping: 25, stiffness: 100, mass: 0.5 }
    const springX = useSpring(mouseX, springConfig)
    const springY = useSpring(mouseY, springConfig)

    // Map mouse movement to translations via transforms natively, bypassing React renders
    const x1 = useTransform(springX, [-0.5, 0.5], [-50, 50])
    const y1 = useTransform(springY, [-0.5, 0.5], [-50, 50])

    const x2 = useTransform(springX, [-0.5, 0.5], [60, -60])
    const y2 = useTransform(springY, [-0.5, 0.5], [60, -60])

    const x3 = useTransform(springX, [-0.5, 0.5], [-30, 30])
    const y3 = useTransform(springY, [-0.5, 0.5], [30, -30])

    if (prefersReducedMotion) {
        return (
            <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-background transition-colors duration-700">
                <div className="absolute -top-[20%] -right-[10%] h-[50vh] w-[50vh] rounded-full bg-primary/10 blur-[100px] transition-colors duration-700 mix-blend-normal dark:mix-blend-color-dodge aurora:bg-success/20 colorful:bg-purple-500/20" />
                <div className="absolute -bottom-[20%] -left-[10%] h-[60vh] w-[60vh] rounded-full bg-info/10 blur-[120px] transition-colors duration-700 mix-blend-normal dark:mix-blend-color-dodge aurora:bg-teal-500/20 colorful:bg-orange-500/20" />
                <div className="absolute top-[40%] left-[30%] h-[30vh] w-[40vh] rounded-full bg-fuchsia-500/5 blur-[150px] transition-colors duration-700 mix-blend-normal dark:mix-blend-color-dodge aurora:bg-indigo-500/20 colorful:bg-pink-500/20" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
            </div>
        )
    }

    return (
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-background transition-colors duration-700">
            {/* Abstract Shape 1 */}
            <motion.div
                style={{ x: x1, y: y1 }}
                className="absolute -top-[20%] -right-[10%] h-[50vh] w-[50vh] rounded-full bg-primary/10 blur-[100px] transition-colors duration-700 mix-blend-normal dark:mix-blend-color-dodge aurora:bg-success/20 colorful:bg-purple-500/20"
            />
            {/* Abstract Shape 2 */}
            <motion.div
                style={{ x: x2, y: y2 }}
                className="absolute -bottom-[20%] -left-[10%] h-[60vh] w-[60vh] rounded-full bg-info/10 blur-[120px] transition-colors duration-700 mix-blend-normal dark:mix-blend-color-dodge aurora:bg-teal-500/20 colorful:bg-orange-500/20"
            />
            {/* Abstract Shape 3 */}
            <motion.div
                style={{ x: x3, y: y3 }}
                className="absolute top-[40%] left-[30%] h-[30vh] w-[40vh] rounded-full bg-fuchsia-500/5 blur-[150px] transition-colors duration-700 mix-blend-normal dark:mix-blend-color-dodge aurora:bg-indigo-500/20 colorful:bg-pink-500/20"
            />
            {/* Grid overlay for texture */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
        </div>
    )
}
