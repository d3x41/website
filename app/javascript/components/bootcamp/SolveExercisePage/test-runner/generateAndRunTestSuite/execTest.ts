import {
  evaluateExpression,
  evaluateFunction,
  interpret,
} from '@/interpreter/interpreter'
import { generateExpects } from './generateExpects'
import { TestRunnerOptions } from '@/components/bootcamp/types/TestRunner'
import { filteredStdLibFunctions } from '@/interpreter/stdlib'
import { generateCodeRunString } from '../../utils/generateCodeRunString'
import { parseArgs } from './parseArgs'
import { type Project } from '@/components/bootcamp/SolveExercisePage/utils/exerciseMap'
import type { Exercise } from '../../exercises/Exercise'
import {
  Animation,
  AnimationTimeline,
} from '../../AnimationTimeline/AnimationTimeline'
import { Frame } from '@/interpreter/frames'

/**
 This is of type TestCallback
 */
export function execTest(
  testData: TaskTest,
  options: TestRunnerOptions,
  project?: Project
): ReturnType<TestCallback> {
  const exercise: Exercise | undefined = project ? new project() : undefined
  runSetupFunctions(exercise, testData.setupFunctions || [])

  const context = {
    externalFunctions: buildExternalFunctions(options, exercise),
    classes: buildExternalClasses(options, exercise),
    languageFeatures: options.config.interpreterOptions,
    customFunctions: options.customFunctions,
  }

  const args = testData.args ? parseArgs(testData.args) : []

  let evaluated
  if (testData.function) {
    evaluated = evaluateFunction(
      options.studentCode,
      context,
      testData.function,
      ...args
    )
  } else if (testData.expression) {
    evaluated = evaluateExpression(
      options.studentCode,
      context,
      testData.expression
    )
  } else {
    evaluated = interpret(options.studentCode, context)
  }

  const { value: actual, frames } = evaluated

  /*if(frames[0].timelineTime !== 0) {
    frames.unshift({
      timelineTime: 0,
      time: 0,
      line: 0,
      code: "",
      status: 'BOOKEND',
      description: ""
    })
  }*/

  const codeRun = testData.codeRun
    ? testData.codeRun
    : generateCodeRunString(testData.function, args)

  const animationTimeline = buildAnimationTimeline(exercise, frames)

  const expects = generateExpects(evaluated, testData, actual, exercise)

  return {
    expects,
    slug: testData.slug,
    codeRun,
    frames,
    type: options.config.testsType || (exercise ? 'state' : 'io'),
    animationTimeline,
    imageSlug: testData.imageSlug,
    view: exercise?.getView(),
  }
}

const buildExternalFunctions = (
  options: TestRunnerOptions,
  exercise: Exercise | undefined
) => {
  const externalFunctions = filteredStdLibFunctions(
    options.config.stdlibFunctions
  )
  if (!exercise) return externalFunctions

  let exerciseFunctions = exercise.availableFunctions || []
  if (options.config.exerciseFunctions != undefined) {
    const required = options.config.exerciseFunctions
    exerciseFunctions = exerciseFunctions.filter((func) =>
      required.includes(func.name)
    )
  }
  return externalFunctions.concat(exerciseFunctions)
}
const buildExternalClasses = (
  options: TestRunnerOptions,
  exercise: Exercise | undefined
) => {
  if (!exercise) return []

  let exerciseClasses = exercise.availableClasses || []
  if (options.config.exerciseClasses != undefined) {
    const required = options.config.exerciseClasses
    exerciseClasses = exerciseClasses.filter((func) =>
      required.includes(func.name)
    )
  }
  return exerciseClasses
}

const runSetupFunctions = (
  exercise: Exercise | undefined,
  setupFunctions: SetupFunction[]
) => {
  if (!exercise) return

  setupFunctions.forEach((functionData) => {
    let [functionName, args] = functionData
    if (!args) {
      args = []
    }
    if (typeof exercise[functionName] === 'function') {
      ;(exercise[functionName] as Function)(null, ...args)
    }
  })
}
export function buildAnimationTimeline(
  exercise: Exercise | undefined,
  frames: Frame[]
) {
  let animations: Animation[] = []
  let placeholder = false
  const lastFrame: Frame | undefined = frames.at(-1)

  // If we have a healthy animation
  if (exercise && exercise.animations && exercise.animations.length > 0) {
    animations = exercise.animations
  }
  // Else if we have a successful non-animation exercise, we create
  // one long animation that lasts for the duration of the frames.
  else if (lastFrame && lastFrame.status === 'SUCCESS') {
    placeholder = true
    animations = [
      {
        targets: `body`,
        duration: lastFrame.time,
        transformations: {
          propProgress: '100%',
        },
        offset: 0,
      },
    ]
  }

  // Finally, as an extra guard, if we've got an infinite loop, then don't
  // add the millions  of animations to the timeline if we know it hurts
  // on that exercise.
  if (
    lastFrame &&
    lastFrame.status === 'ERROR' &&
    (lastFrame.error?.type == 'MaxIterationsReached' ||
      lastFrame.error?.type == 'InfiniteRecursion') &&
    !exercise?.showAnimationsOnInfiniteLoops
  ) {
    // No-op
    animations = []
    placeholder = true
  }

  return new AnimationTimeline({}, frames).populateTimeline(
    animations,
    placeholder
  )
}
