# Example Meta-Agent Workflow

## Task 1: Create Hello World Function
**Type**: Micro-task (5 lines)
**Agent**: python-pro
**Description**: Create a simple hello world function
```python
def hello_world():
    return "Hello, World!"
```

## Task 2: Add Type Hints
**Type**: Micro-task (7 lines)
**Agent**: python-pro
**Description**: Add type hints to the function
```python
def hello_world() -> str:
    """Return a greeting message."""
    return "Hello, World!"
```

## Task 3: Create Test
**Type**: Micro-task (10 lines)
**Agent**: test-automator
**Description**: Create a unit test
```python
def test_hello_world():
    """Test the hello world function."""
    result = hello_world()
    assert result == "Hello, World!"
    assert isinstance(result, str)
```

## Task 4: Add Main Block
**Type**: Micro-task (6 lines)
**Agent**: python-pro
**Description**: Add main execution block
```python
if __name__ == "__main__":
    print(hello_world())
```