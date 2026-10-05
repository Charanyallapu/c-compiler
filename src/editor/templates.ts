export interface CodeTemplate {
  id: string;
  name: string;
  description: string;
  code: string;
  defaultStdin?: string;
}

export const TEMPLATES: CodeTemplate[] = [
  {
    id: 'scanf_sum',
    name: 'Input & Scanf (Sum 2 Numbers)',
    description: 'Demonstrates reading interactive stdin using scanf and printing sum',
    defaultStdin: '10 20',
    code: `/*
 * Stdin & Scanf Demo
 * Enter numbers in the Input box below (e.g. 10 20)
 */
#include <stdio.h>

int main() {
    int a, b;
    printf("Please enter two numbers:\\n");
    if (scanf("%d %d", &a, &b) == 2) {
        printf("%d + %d = %d\\n", a, b, a + b);
        printf("%d\\n", a + b);
    } else {
        printf("Error: Invalid or missing input in stdin.\\n");
    }
    return 0;
}
`
  },
  {
    id: 'hello_world',
    name: 'Hello, World!',
    description: 'Basic C program with printf and standard IO',
    defaultStdin: '',
    code: `/*
 * Client-Side C Compiler & Runner
 * Compiled and executed 100% inside your browser via WebAssembly!
 */
#include <stdio.h>

int main() {
    printf("===========================================\\n");
    printf("  Hello from Client-Side WebAssembly C!    \\n");
    printf("  Compiled and executed in your browser.   \\n");
    printf("  No backend server. 100%% client-side!    \\n");
    printf("===========================================\\n");
    return 0;
}
`
  },
  {
    id: 'fibonacci',
    name: 'Fibonacci Sequence',
    description: 'Calculates Fibonacci numbers recursively and iteratively',
    defaultStdin: '12',
    code: `#include <stdio.h>

long long fib_recursive(int n) {
    if (n <= 0) return 0;
    if (n == 1) return 1;
    return fib_recursive(n - 1) + fib_recursive(n - 2);
}

int main() {
    int n = 12;
    printf("Enter number of terms (default %d):\\n", n);
    scanf("%d", &n);
    if (n < 1) n = 1;
    if (n > 30) n = 30; // Guard recursion

    printf("Fibonacci Sequence up to %d terms:\\n", n);
    for (int i = 0; i < n; i++) {
        printf("F(%2d) = %lld\\n", i, fib_recursive(i));
    }
    return 0;
}
`
  },
  {
    id: 'bubble_sort',
    name: 'Array Bubble Sort',
    description: 'Demonstrates arrays, pointers, and sorting algorithm',
    defaultStdin: '',
    code: `#include <stdio.h>

void swap(int *xp, int *yp) {
    int temp = *xp;
    *xp = *yp;
    *yp = temp;
}

void bubbleSort(int arr[], int n) {
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                swap(&arr[j], &arr[j + 1]);
            }
        }
    }
}

void printArray(int arr[], int size) {
    for (int i = 0; i < size; i++) {
        printf("%d ", arr[i]);
    }
    printf("\\n");
}

int main() {
    int arr[] = {64, 34, 25, 12, 22, 11, 90, 42, 8};
    int n = sizeof(arr) / sizeof(arr[0]);

    printf("Original array: ");
    printArray(arr, n);

    bubbleSort(arr, n);

    printf("Sorted array:   ");
    printArray(arr, n);
    return 0;
}
`
  },
  {
    id: 'math_trig',
    name: 'Math & Trigonometry (<math.h>)',
    description: 'Using standard math functions, floating point arithmetic, and constants',
    defaultStdin: '',
    code: `#include <stdio.h>
#include <math.h>

#define PI 3.14159265358979323846

int main() {
    printf("--- Math & Trigonometry in WASM ---\\n");
    printf("PI:          %.10f\\n", PI);
    printf("sin(PI / 2): %.4f\\n", sin(PI / 2.0));
    printf("cos(0):      %.4f\\n", cos(0.0));
    printf("sqrt(144):   %.2f\\n", sqrt(144.0));
    printf("pow(2, 10):  %.2f\\n", pow(2.0, 10.0));
    printf("log(2.7183): %.4f\\n", log(2.718281828));
    return 0;
}
`
  },
  {
    id: 'prime_sieve',
    name: 'Sieve of Eratosthenes',
    description: 'Finds prime numbers using dynamic boolean sieve array',
    defaultStdin: '50',
    code: `#include <stdio.h>
#include <stdbool.h>
#include <string.h>

void sieveOfEratosthenes(int n) {
    bool prime[n + 1];
    memset(prime, true, sizeof(prime));

    for (int p = 2; p * p <= n; p++) {
        if (prime[p] == true) {
            for (int i = p * p; i <= n; i += p)
                prime[i] = false;
        }
    }

    printf("Prime numbers up to %d:\\n", n);
    int count = 0;
    for (int p = 2; p <= n; p++) {
        if (prime[p]) {
            printf("%d ", p);
            count++;
        }
    }
    printf("\\nTotal primes found: %d\\n", count);
}

int main() {
    int limit = 50;
    printf("Enter upper limit for prime search:\\n");
    scanf("%d", &limit);
    if (limit > 500) limit = 500;
    sieveOfEratosthenes(limit);
    return 0;
}
`
  },
  {
    id: 'pointers_memory',
    name: 'Pointers & Dynamic Memory (malloc)',
    description: 'Dynamic memory allocation with malloc and free',
    defaultStdin: '5',
    code: `#include <stdio.h>
#include <stdlib.h>

int main() {
    int n = 5;
    printf("Allocating array of %d integers using malloc...\\n", n);

    int *ptr = (int*)malloc(n * sizeof(int));
    if (ptr == NULL) {
        printf("Memory allocation failed!\\n");
        return 1;
    }

    for (int i = 0; i < n; ++i) {
        ptr[i] = (i + 1) * 10;
    }

    printf("Values in dynamically allocated array:\\n");
    for (int i = 0; i < n; ++i) {
        printf("ptr[%d] = %d (address: %p)\\n", i, ptr[i], (void*)&ptr[i]);
    }

    free(ptr);
    printf("Memory successfully freed.\\n");
    return 0;
}
`
  },
  {
    id: 'compile_error_demo',
    name: 'Compilation Error Demo',
    description: 'Shows how Clang compiler catches syntax and type errors with line numbers',
    defaultStdin: '',
    code: `/*
 * Clang Diagnostics Demo
 * Shows error markers and line numbers in editor and terminal
 */
#include <stdio.h>

int main() {
    // 1. Incompatible type warning/error
    int x = "hello string";

    // 2. Undefined variable
    unknown_variable = 42;

    // 3. Syntax error: missing semicolon
    printf("Number: %d", x)

    return 0;
}
`
  },
  {
    id: 'infinite_loop_demo',
    name: 'Infinite Loop Protection Demo',
    description: 'Tests the execution timeout watchdog and Stop button',
    defaultStdin: '',
    code: `/*
 * Infinite Loop Protection Demo
 * The browser UI will NOT freeze because execution runs in a Web Worker!
 * The execution timeout watchdog will automatically terminate it after 10s,
 * or you can click the "Stop" button at any time.
 */
#include <stdio.h>

int main() {
    printf("Starting infinite loop... (click STOP or wait for watchdog timeout)\\n");
    
    long long counter = 0;
    while (1) {
        counter++;
        // Spin without blocking browser UI
    }

    return 0;
}
`
  }
];
