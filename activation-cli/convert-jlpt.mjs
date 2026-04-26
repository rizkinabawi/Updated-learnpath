import fs from 'fs';
import path from 'path';

/**
 * CLI tool to convert JLPT JSON from dethitiengnhat.com format to LearnPath CoursePack format.
 * 
 * Input format: 
 * Array of { level, exam_number, sections: [ { section_name, questions: [ { question, choices, correct_answer } ] } ] }
 * 
 * Output format:
 * CoursePack JSON (compatible with LearnPath app import)
 */

const generateId = () => Date.now().toString() + Math.random().toString(36).substring(2, 9);

function convertJlptToPack(jlptData) {
  const now = new Date().toISOString();
  const pack = {
    version: 1,
    exportedAt: now,
    paths: [],
    modules: [],
    lessons: [],
    flashcardPacks: [],
    quizPacks: [],
    flashcards: [],
    quizzes: [],
    materials: [],
    notes: []
  };

  // Group by level (Each level becomes a LearningPath)
  const levels = new Set(jlptData.map(d => d.level));
  
  for (const level of levels) {
    const pathId = `lp-${level}-${generateId()}`;
    pack.paths.push({
      id: pathId,
      name: `JLPT ${level} Practice`,
      description: `Collection of exams and exercises for JLPT ${level} level.`,
      userId: 'local',
      tags: ['JLPT', level],
      createdAt: now
    });

    // Exams in this level (Each exam becomes a Module)
    const exams = jlptData.filter(d => d.level === level);
    for (const exam of exams) {
      const moduleId = `mod-${exam.exam_number}-${generateId()}`;
      pack.modules.push({
        id: moduleId,
        pathId: pathId,
        name: `Exam #${exam.exam_number}`,
        description: `Full JLPT practice exam number ${exam.exam_number}`,
        order: exam.exam_number,
        createdAt: now
      });

      // Sections in this exam (Each section becomes a Lesson)
      for (let i = 0; i < (exam.sections || []).length; i++) {
        const section = exam.sections[i];
        const lessonId = `les-${i}-${generateId()}`;
        
        const rawTitle = section.title || '';
        const cleanTitle = rawTitle.replace(/\s*-\s*dethitiengnhat\.com/gi, "").trim();

        pack.lessons.push({
          id: lessonId,
          moduleId: moduleId,
          name: section.section_name || `Section ${i + 1}`,
          description: cleanTitle,
          order: i + 1,
          createdAt: now
        });

        // Add a QuizPack for this lesson
        const packId = `qp-${lessonId}`;
        pack.quizPacks.push({
          id: packId,
          lessonId: lessonId,
          name: section.section_name,
          createdAt: now
        });

        // Questions in this section
        for (const q of (section.questions || [])) {
          // Conditional handling for choices format
          let options = [];
          if (Array.isArray(q.choices)) {
            options = q.choices;
          } else if (typeof q.choices === 'object') {
            // Sort keys numerically to ensure order 1, 2, 3, 4
            const keys = Object.keys(q.choices).sort((a, b) => parseInt(a) - parseInt(b));
            options = keys.map(k => q.choices[k]);
          }

          // Conditional handling for correct answer
          let answerText = q.correct_text;
          if (!answerText && q.correct_answer && q.choices) {
            answerText = q.choices[q.correct_answer];
          }

          if (!answerText && options.length > 0) {
            // Fallback if index-based
            const idx = parseInt(q.correct_answer) - 1;
            if (idx >= 0 && idx < options.length) {
              answerText = options[idx];
            }
          }

          pack.quizzes.push({
            id: `q-${generateId()}`,
            lessonId: lessonId,
            packId: packId,
            question: q.question,
            options: options,
            answer: answerText || '',
            type: 'multiple-choice',
            createdAt: now
          });
        }
      }
    }
  }

  return pack;
}

// CLI logic
const inputFile = process.argv[2];
const outputFile = process.argv[3] || 'jlpt-course-pack.json';

if (!inputFile) {
  console.log('Usage: node convert-jlpt.mjs <input.json> [output.json]');
  process.exit(1);
}

try {
  const raw = fs.readFileSync(inputFile, 'utf8');
  const data = JSON.parse(raw);
  
  // Handle single object vs array
  const inputData = Array.isArray(data) ? data : [data];
  
  const result = convertJlptToPack(inputData);
  
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  console.log(`Success! Converted to ${outputFile}`);
  console.log(`Summary:`);
  console.log(`- Learning Paths: ${result.paths.length}`);
  console.log(`- Modules (Exams): ${result.modules.length}`);
  console.log(`- Lessons (Sections): ${result.lessons.length}`);
  console.log(`- Quizzes: ${result.quizzes.length}`);
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
