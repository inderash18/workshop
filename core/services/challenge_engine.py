import random
from datetime import datetime


LEVELS = [
    {
        "id": 1,
        "name": "Pattern Intelligence",
        "icon": "🧠",
        "description": "Decode hidden patterns and sequences.",
        "color": "#6366f1",
        "time_limit": 240,
        "questions": [
            {
                "id": "l1_q1", "type": "mcq",
                "text": "What comes next in the sequence: 2, 6, 12, 20, 30, ?",
                "options": ["36", "40", "42", "44"],
                "correct": "42",
            },
            {
                "id": "l1_q2", "type": "mcq",
                "text": "If A = 1, B = 2, C = 3 ... what does ML represent numerically?",
                "options": ["29", "31", "25", "23"],
                "correct": "29",
            },
            {
                "id": "l1_q3", "type": "mcq",
                "text": "Find the odd one out: Triangle, Square, Hexagon, Octagon, Circle",
                "options": ["Triangle", "Hexagon", "Octagon", "Circle"],
                "correct": "Circle",
            },
            {
                "id": "l1_q4", "type": "text",
                "text": "What shape completes this pattern: ◯ ◻ ◯ ◻ ◯ ?",
                "placeholder": "Enter the shape symbol",
                "correct": "◻",
            },
            {
                "id": "l1_q5", "type": "mcq",
                "text": "In binary, what is 63?",
                "options": ["111100", "111111", "110011", "101010"],
                "correct": "111111",
            },
        ],
    },
    {
        "id": 2,
        "name": "Logic Engine",
        "icon": "⚙️",
        "description": "Deductive reasoning and conditional logic.",
        "color": "#a855f7",
        "time_limit": 300,
        "questions": [
            {
                "id": "l2_q1", "type": "mcq",
                "text": "If all Bloops are Razzies and all Razzies are Lazzies, then all Bloops are definitely Lazzies. True or False?",
                "options": ["True", "False", "Cannot be determined", "Only if Lazzies exist"],
                "correct": "True",
            },
            {
                "id": "l2_q2", "type": "mcq",
                "text": "A farmer has 17 sheep. All but 9 die. How many sheep are left?",
                "options": ["8", "9", "17", "0"],
                "correct": "9",
            },
            {
                "id": "l2_q3", "type": "text",
                "text": "A train leaves Station A at 60 km/h. Another leaves Station B (300 km away) at 40 km/h toward A. After how many hours do they meet?",
                "placeholder": "Enter the number of hours",
                "correct": "3",
            },
            {
                "id": "l2_q4", "type": "mcq",
                "text": "If P implies Q, and Q implies R, which is definitely true?",
                "options": ["P implies R", "R implies P", "P equals R", "Q implies P"],
                "correct": "P implies R",
            },
            {
                "id": "l2_q5", "type": "mcq",
                "text": "In a room of 23 people, what is the approximate probability that at least two share a birthday?",
                "options": ["About 10%", "About 25%", "About 50%", "About 75%"],
                "correct": "About 50%",
            },
        ],
    },
    {
        "id": 3,
        "name": "AI Thinking Challenge",
        "icon": "💡",
        "description": "Scenario-based AI reasoning and ethical thinking.",
        "color": "#ec4899",
        "time_limit": 360,
        "questions": [
            {
                "id": "l3_q1", "type": "textarea",
                "text": "An AI hiring tool is found to favor male candidates. What are the most likely causes, and how would you fix this? Write your response in 3-5 sentences.",
                "placeholder": "Describe the causes and your proposed solutions...",
                "min_words": 30,
            },
            {
                "id": "l3_q2", "type": "mcq",
                "text": "Which approach is MOST effective for reducing hallucination in an LLM?",
                "options": [
                    "Making the model larger",
                    "Retrieval-Augmented Generation (RAG)",
                    "Lowering the temperature to 0",
                    "Using more training data",
                ],
                "correct": "Retrieval-Augmented Generation (RAG)",
            },
            {
                "id": "l3_q3", "type": "textarea",
                "text": "You are deploying an AI system in healthcare. Describe 3 critical considerations before deployment. Think about safety, bias, and regulation.",
                "placeholder": "List and explain your considerations...",
                "min_words": 40,
            },
            {
                "id": "l3_q4", "type": "mcq",
                "text": "What is the 'alignment problem' in AI?",
                "options": [
                    "Models not fitting training data",
                    "Ensuring AI systems act in accordance with human values",
                    "Aligning multiple models together",
                    "Matching GPU compute to model size",
                ],
                "correct": "Ensuring AI systems act in accordance with human values",
            },
        ],
    },
    {
        "id": 4,
        "name": "Prompt Architect",
        "icon": "✏️",
        "description": "Design and evaluate prompts for maximum performance.",
        "color": "#22c55e",
        "time_limit": 360,
        "questions": [
            {
                "id": "l4_q1", "type": "textarea",
                "text": "Write a prompt that instructs an LLM to act as a expert travel advisor for budget travelers in Southeast Asia. The prompt should define the persona, constraints, and expected output format.",
                "placeholder": "Write your complete prompt here...",
                "min_words": 40,
            },
            {
                "id": "l4_q2", "type": "mcq",
                "text": "Which prompt technique is MOST likely to improve factual accuracy?",
                "options": [
                    "Adding 'Please be creative' at the start",
                    "Chain-of-thought reasoning with 'Let's think step by step'",
                    "Writing the prompt in ALL CAPS",
                    "Making the prompt as short as possible",
                ],
                "correct": "Chain-of-thought reasoning with 'Let's think step by step'",
            },
            {
                "id": "l4_q3", "type": "textarea",
                "text": "Given this poor prompt: 'Write about AI'. Rewrite it as an effective prompt that would produce a specific, high-quality response. Explain what you changed and why.",
                "placeholder": "Provide your improved prompt and explanation...",
                "min_words": 40,
            },
        ],
    },
    {
        "id": 5,
        "name": "Modern AI Knowledge",
        "icon": "📚",
        "description": "RAG, fine-tuning, embeddings, LLM architecture.",
        "color": "#3b82f6",
        "time_limit": 300,
        "questions": [
            {
                "id": "l5_q1", "type": "mcq",
                "text": "What is the primary resource bottleneck for fine-tuning large language models?",
                "options": ["RAM", "GPU VRAM", "Network bandwidth", "Storage"],
                "correct": "GPU VRAM",
            },
            {
                "id": "l5_q2", "type": "textarea",
                "text": "Explain the difference between RAG and fine-tuning. When would you choose one over the other? Give specific use cases for each.",
                "placeholder": "Explain RAG vs fine-tuning with use cases...",
                "min_words": 40,
            },
            {
                "id": "l5_q3", "type": "mcq",
                "text": "What is the purpose of a vector embeddings database in an AI system?",
                "options": [
                    "To store model weights",
                    "To enable semantic search and similarity matching",
                    "To cache API responses",
                    "To compress model parameters",
                ],
                "correct": "To enable semantic search and similarity matching",
            },
            {
                "id": "l5_q4", "type": "mcq",
                "text": "In the Transformer architecture, what mechanism allows the model to focus on different parts of the input?",
                "options": ["Recurrent loops", "Self-attention", "Convolutional layers", "Pooling"],
                "correct": "Self-attention",
            },
            {
                "id": "l5_q5", "type": "mcq",
                "text": "What is 'temperature' in LLM inference?",
                "options": [
                    "The physical temperature of the GPU",
                    "A parameter controlling randomness of output",
                    "The learning rate during training",
                    "The number of layers in the model",
                ],
                "correct": "A parameter controlling randomness of output",
            },
        ],
    },
    {
        "id": 6,
        "name": "Brain Challenge",
        "icon": "🧩",
        "description": "Mathematical thinking and constraint optimization.",
        "color": "#eab308",
        "time_limit": 300,
        "questions": [
            {
                "id": "l6_q1", "type": "mcq",
                "text": "You have 3 ropes. Rope A burns in 1 hour, Rope B in 2 hours, Rope C in 3 hours. You can cut and light ropes at any point. How many ropes do you need to measure exactly 4.5 hours?",
                "options": ["1", "2", "3", "It's impossible"],
                "correct": "3",
            },
            {
                "id": "l6_q2", "type": "mcq",
                "text": "What is the minimum number of moves to solve a Tower of Hanoi with 4 disks?",
                "options": ["8", "15", "16", "31"],
                "correct": "15",
            },
            {
                "id": "l6_q3", "type": "text",
                "text": "If you flip a fair coin 3 times, what is the probability of getting exactly 2 heads? Express as a simplified fraction.",
                "placeholder": "e.g. 3/8",
                "correct": "3/8",
            },
            {
                "id": "l6_q4", "type": "mcq",
                "text": "In graph theory, what is the minimum number of colors needed to color any planar map?",
                "options": ["2", "3", "4", "5"],
                "correct": "4",
            },
            {
                "id": "l6_q5", "type": "mcq",
                "text": "A knapsack problem has items with weights [2, 3, 4, 5] and values [3, 4, 5, 6]. With capacity 8, what is the maximum value achievable?",
                "options": ["9", "10", "11", "12"],
                "correct": "10",
            },
        ],
    },
    {
        "id": 7,
        "name": "Secret Research Lab",
        "icon": "🔬",
        "description": "Open-ended creative problem solving under constraints.",
        "color": "#f97316",
        "time_limit": 420,
        "questions": [
            {
                "id": "l7_q1", "type": "textarea",
                "text": "You have a budget of Rs. 1000, no GPU access, and 1 week. Design an AI-powered solution that could help farmers in rural India predict crop diseases from phone photos. Describe your approach, tools, and how you'd work within these constraints.",
                "placeholder": "Describe your complete solution...",
                "min_words": 50,
            },
            {
                "id": "l7_q2", "type": "textarea",
                "text": "Propose a novel research idea that combines AI with any non-CS field (biology, art, music, linguistics, etc.). What problem does it solve? What data would you need? What model architecture would you use?",
                "placeholder": "Describe your research idea...",
                "min_words": 50,
            },
            {
                "id": "l7_q3", "type": "mcq",
                "text": "Which of these is the BEST example of a well-scoped AI research problem?",
                "options": [
                    "Make AI better",
                    "Reduce LLM hallucination in medical Q&A by 30% using retrieval augmentation",
                    "Build a chatbot",
                    "Use deep learning for everything",
                ],
                "correct": "Reduce LLM hallucination in medical Q&A by 30% using retrieval augmentation",
            },
        ],
    },
]


def get_challenge_data(candidate_id):
    rng = hash(candidate_id) % (2**32)
    random.seed(rng)

    result = []
    for level in LEVELS:
        questions = list(level["questions"])
        random.shuffle(questions)
        result.append({
            "id": level["id"],
            "name": level["name"],
            "icon": level["icon"],
            "description": level["description"],
            "color": level["color"],
            "time_limit": level["time_limit"],
            "questions": questions,
        })

    random.seed()
    return result


def get_level_count():
    return len(LEVELS)


def get_total_time():
    return sum(lv["time_limit"] for lv in LEVELS)
