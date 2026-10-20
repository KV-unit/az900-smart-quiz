# Content notes: where the questions come from

This is an **unofficial** study tool. It is not affiliated with Microsoft.

## Rules I followed

- **Original questions only.** Every question and explanation was written for this project.
  No real exam questions, and no questions copied from Microsoft Learn knowledge checks or other sources.
- **Based on the public skills outline.** Topics follow the *Study guide for Exam AZ-900: Microsoft Azure Fundamentals*
  on Microsoft Learn (skills measured effective 20 July 2026).
- **No Microsoft logos or branding.** The app uses its own name and colours and is labelled unofficial.
- **Every answer has an explanation**, so learners understand *why*, not just *what*.

## Coverage

| Domain (exam weight)                           | Topics in this app                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Describe cloud concepts (25-30%)               | Cloud computing; Benefits of cloud services; Cloud service types                |
| Describe Azure architecture and services (35-40%) | Core architectural components; Compute and networking; Storage; Identity, access and security |
| Describe Azure management and governance (30-35%) | Cost management; Governance and compliance; Managing and deploying resources; Monitoring tools |

72 questions across 11 topics, each tagged Easy, Medium or Hard.

## Question format

Each question in `data/questions.json` has: an `id`, a `topic`, a `difficulty` (1-3), the `question`,
exactly four `options`, the zero-based index of the correct `answer`, and an `explanation`.

Answer positions are shuffled by the app every time a quiz runs, so the position of the right answer
in the file does not matter.

## Accuracy

The explanations were written from the public skills outline and the concepts taught in the Microsoft Learn
AZ-900 learning paths. They have not been reviewed by Microsoft, and Azure changes over time. Always confirm
important details in the official documentation, and please open an issue if you spot something out of date.
