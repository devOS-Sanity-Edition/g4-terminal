const colors = require("colors")
const readline = require("readline")
const argv = require("yargs").argv

const {ReadStream, WriteStream} = require("tty")

/** @type {ReadStream} */
const stdin = process.stdin
/** @type {WriteStream} */
const stdout = process.stdout

readline.emitKeypressEvents(process.stdin)
stdin.setRawMode(true)

class GameItem {
    pixelTest(x, y) { return "none" }
    advance(dtime) {}
}

class Ball extends GameItem {
    constructor(angle, distance, radius) {
        super()
        this.angle = angle
        this.distance = distance
        this.radius = radius
    }

    advance(dtime) {
        this.angle += dtime
    }

    pixelTest(x, y) {
        let angle = this.angle * 2 * Math.PI
        let centerX = Math.cos(angle) * this.distance
        let centerY = Math.sin(angle) * this.distance

        let pointDist = Math.hypot(centerX - x, centerY - y)

        if (pointDist > this.radius) return "none"
        if (pointDist > this.radius * 0.9) return "half"
        return "full"
    }
}

class Bar extends GameItem {
    constructor(angleStart, angleLength, distance, radius) {
        super()
        this.angleStart = angleStart
        this.angleLength = angleLength
        this.distance = distance
        this.radius = radius
    }

    advance(dtime) {
        this.angleStart += dtime
    }

    pixelTest(x, y) {
        let angle = Math.atan2(y, x)
        if (angle < 0) angle += Math.PI * 2
        angle /= Math.PI * 2

        let clampedStart = this.angleStart % 1
        let clampedEnd = (clampedStart + this.angleLength) % 1

        let isBetween = false
        if (clampedEnd > clampedStart) {
            isBetween = angle >= clampedStart && angle <= clampedEnd
        } else {
            isBetween = angle >= clampedStart || angle <= clampedEnd
        }
        if (!isBetween) return "none"

        let radiusDistance = Math.abs(Math.hypot(x, y) - this.distance)

        if (radiusDistance > this.radius) return "none"
        if (radiusDistance > this.radius * 0.7) return "half"
        return "full"
    }
}

class Bullet extends GameItem {
    constructor(x, y, veloX, veloY) {
        super()

        this.x = x
        this.y = y
        this.veloX = veloX
        this.veloY = veloY
    }

    advance(dtime) {
        this.x += this.veloX * dtime
        this.y += this.veloY * dtime
    }

    pixelTest(x, y) {
        return (Math.hypot(this.x - x, this.y - y) <= 0.05) ? "full" : "none"
    }
}

class Game {
    constructor() {
        /**
         * @type {GameItem[]}
         */
        this.items = []

        this.level = 0

        this.playerAngle = 0

        this.bullet = null

        this.highlight = "none"
        this.highlightTimer = 0
    }

    /**
     * @param {Number} n 
     * @param {Boolean} isSmall 
     * @param {Boolean} isEasy 
     * @returns {Number[]}
     */
    generateAngleArrangement(
        n, isSmall, isEasy
    ) {
        let angleBetween = 1 / n

        let shiftAngle = angleBetween / 3
        let isShifted = false

        let shiftSign = (Math.random() >= 0.5) ? 1 : -1
    
        let angles = []
    
        for (let i = 0; i < n; i++) {
            let angle = i * angleBetween
    
            if (isShifted && n == 4 && i % 2) {
                angle += shiftSign * shiftAngle
            } else if (isShifted && n == 6 && !isSmall) {
                if (i % 3 == 0) angle += shiftSign * shiftAngle
                if (i % 3 == 1) angle -= shiftSign * shiftAngle
            }
    
            angles.push(angle)
        }
    
        return angles
    }

    /**
     * @param {Number} difficulty 
     * @param {Number} distance 
     * @returns {RingElement[]}
     */
    generateInnerRing(difficulty, distance) {
        let elements = []

        let n = 2
        if (!distance) distance = 200
        if (difficulty == 2) n = Math.floor(Math.random() * 2) + 2
        if (difficulty == 3) n = 4
    
        n += Math.round(Math.random() * 2)
    
        let angles = this.generateAngleArrangement(n, true, difficulty < 3)
    
        for (var i = 0; i < n; i++) {
            let isBall = Math.random() >= 0.5
    
            if (isBall || (!isBall && i == 0)) {
                elements.push(
                    new Ball(angles[i], distance, 0.3)
                )
    
                if (Math.random() >= 0.7 && difficulty > 1 && i > 0) {
                    elements.push(
                        new Ball(
                            angles[i] + 0.08, distance, 0.15
                        ),
                        new Ball(
                            angles[i] - 0.08, distance, 0.15
                        )
                    )
    
                }
            } else if (!isBall && i > 0) {
                let angleStart = angles[i]
                let angleLength = angles[(i + 1) % angles.length] - angleStart
                if (angleLength < 0) angleLength += 1
    
                elements.push(
                    new Bar(
                        angleStart, angleLength, distance, 0.06
                    )
                )
    
                if (Math.random() >= 0.5) {
                    elements.push(
                        new Ball(
                            angleStart, distance, 0.15
                        ),
                        new Ball(
                            angleStart + angleLength, distance, 0.15
                        )
                    )
                }
            }
        }
    
        return elements
    }

    advance(time) {
        time /= 3

        this.items.forEach(item => {
            item.advance(time)
        })

        if (this.bullet) this.bullet.advance(time)

        this.playerAngle += -time
    }

    hitTest() {
        if (!this.bullet) return

        let hit = this.items.some(item => (item.pixelTest(this.bullet.x, this.bullet.y) !== "none"))

        if (hit) {
            this.resetProgression()
        } else if (Math.hypot(this.bullet.x, this.bullet.y) > 1.6) {
            this.nextLevel()
        }
    }

    render(isFirst) {
        let w = 53, h = 25

        let str = ""

        str = "Level " + ` ${this.level} `.bgRed + "\n"

        let bullet = this.bullet
        if (!bullet) {
            bullet = new Bullet(
                Math.cos(this.playerAngle * 2 * Math.PI) * 0.1,
                Math.sin(this.playerAngle * 2 * Math.PI) * 0.1,
                0, 0
            )
        }

        if (!isFirst) {
            stdout.moveCursor(-w, -h - 1)
            stdout.clearScreenDown()
        }

        for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
                let pointX = 2 * x / (w - 1) - 1
                let pointY = 2 * y / (h - 1) - 1
    
                let draw = "none"
                this.items.forEach(item => {
                    let test = item.pixelTest(pointX, pointY)
                    if (test === "none") return

                    if (test === "full") draw = "full"
                    if (test === "half") draw = (draw === "full") ? "full" : "half"
                })
    
                let letter = " "
                if (draw !== "none") {

                    if (draw === "full")
                        letter = letter.bgCyan
                    else
                        letter = letter.bgBlue
                
                    // if (this.highlight == "next")
                    //     letter = letter.green
                    // else if (this.highlight == "hit")
                    //     letter = letter.red
                } else if (bullet.pixelTest(pointX, pointY) !== "none") {
                    letter = " ".bgWhite
                } else if (pointX == 0 && pointY == 0) {
                    letter = "+".yellow
                }
    
                str += letter
            }
            str += "\n"
        }
        stdout.write(str)

        
        if (this.highlightTimer) {
            this.highlightTimer--
            if (!this.highlightTimer) this.highlight = "none"
        }
    }

    nextLevel() {
        this.bullet = null
        this.level++

        this.start()

        this.highlight = "next"
        this.highlightTimer = 4
    }

    resetProgression() {
        this.bullet = null
        this.level = 0

        this.start()

        this.highlight = "hit"
        this.highlightTimer = 4
    }

    start() {
        let difficulty = 1
        if (this.level > 6) difficulty = 2

        this.items = this.generateInnerRing(difficulty, 0.7)
    }

    shoot() {
        if (this.bullet) return

        this.bullet = new Bullet(
            Math.cos(this.playerAngle * 2 * Math.PI) * 0.1,
            Math.sin(this.playerAngle * 2 * Math.PI) * 0.1,
            Math.cos(this.playerAngle * 2 * Math.PI) * 10,
            Math.sin(this.playerAngle * 2 * Math.PI) * 10
        )
    }
}

function start() {
    console.log(
        " G4 Terminal ".bgGreen.black + " by " + "@scintilla4evr".green
    )
    console.log(
        "Press " + " Space ".bgYellow.black + " to shoot, " + " Ctrl-C ".bgYellow.black + " to exit"
    )

    let game = new Game()

    game.start()
    
    game.render(true)

    let fps = 30
    if (argv.framerate) fps = +argv.framerate
    
    setInterval(() => {
        game.hitTest()
        game.advance(1/fps)
        game.render()
    }, 1000/fps)

    process.stdin.on("keypress", (str, key) => {
        if (key.ctrl && key.name == "c") {
            process.exit()
        } else if (key.name == "space") {
            game.shoot()
        }
    })
}

start()